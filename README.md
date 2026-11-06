# INFIDEC Marketplace Admin

Centralized administration for every INFIDEC product: catalogue, source-code packages, versions,
documentation, orders, licenses, downloads, support and sales — built on Next.js and Firebase.

```
Next.js INFIDEC Admin  (App Router, React 19, Tailwind 4, shadcn/ui)
        │
Firebase Authentication ── session cookies, staff roles (custom claims)
        │
 ┌──────┴────────────┐
Cloud Firestore    Firebase Storage
(metadata)         (private ZIPs, PDFs, media)
        │
Firebase Cloud Functions ── claims sync, verification, download authorization, notifications
```

## Status

| Phase | Scope | State |
| ----- | ----- | ----- |
| 1 | Next.js, premium UI, Firebase config, authentication, dashboard, RBAC | **Done** |
| 2 | Multi-product management, product import, creation wizard, media | **Done** |
| 3 | Storage integration, source ZIP upload, packages, versions | **Done** |
| 4 | Documentation CMS, customers, orders, purchase records, licenses | **Done** |
| 5 | Secure downloads, Envato API, marketplace listings, support tickets, refunds | **Done** |
| 6 | Website sync, email, analytics, reports, activity logs | Planned |
| 7 | Security & performance testing, production deployment | Planned |

Every sidebar entry from the spec already exists. Modules from later phases show a roadmap page
(`src/components/module-roadmap.tsx`) until they ship; replace the route's `page.tsx` to deliver one.

## Getting started

Requirements: Node 22+, the Firebase CLI (`npm i -g firebase-tools`), access to the `infidec-admin` Firebase project.

```bash
npm install
cp .env.example .env.local        # fill in the web config (firebase apps:sdkconfig web)
# put the service-account JSON in ./secret/ (git-ignored) and point FIREBASE_SERVICE_ACCOUNT_PATH at it

npm run seed                       # roles, default settings, marketplaces (idempotent)
npm run seed -- --admin-email you@infidec.com --admin-name "Your Name"
                                   # creates the first Super Admin and prints a one-time password link
npm run deploy:rules               # Firestore rules + indexes, Storage rules
npm run dev
```

In the Firebase console make sure **Authentication → Sign-in method → Email/Password** is enabled.

### Importing the website catalogue

The five existing products (QwikMart, Go4Market, Go4Foodie, Go4Ride, ClassiAds-Hub) come from the
website source that powers https://infidec.com/products:

```bash
npm run catalog:extract     # reads ../infidec-marketplace → data/website-catalog.json
```

The extractor verifies each product's name and prices against the live page and records the
source commit. Then open **All Products → Import from website**, review the preview (duplicates are
detected by slug, source and name), and confirm. Images are copied from infidec.com into private
Storage. Website ratings and sales counts are deliberately not imported.

### Source packages & versions

Each product has its own versions (draft → published → deprecated) with release notes, new
features, improvements and bug fixes. Packages (complete source, apps, panels, backend,
documentation, modules) are uploaded to a version:

1. The server registers the upload and issues a short-lived staff token.
2. The browser uploads straight to `uploads/staging/{uid}/…` in private Storage (resumable,
   with pause/resume/cancel) — allowed by `storage.rules` only for that staff member.
3. The server validates the ZIP's structure without extracting it (corrupted, truncated,
   encrypted or path-traversal archives are rejected), computes SHA-256, rejects duplicates and
   moves the file to `products/{productId}/source-code/{versionId}/`.

Replacing a package keeps the old file as history; deleting removes the file but keeps its record.
Staff downloads use 15-minute signed URLs and are logged. Publishing a version makes it the
product's current version when it is the highest published one. The maximum upload size is set
in Storage Management (capped at 2 GB by the Storage rules).

### Licenses, downloads & Envato

- **Envato API** (Integrations → Envato API): paste a personal token with *View your Envato account
  username* and *View your items' sales history*. It is encrypted with AES-256-GCM using
  `INTEGRATION_ENCRYPTION_KEY` (server env, 32 bytes base64) and never sent to the browser.
- **Verify Purchase Code** checks a code with the official author-sale endpoint, matches the item to a
  product by its Envato item ID and logs every attempt. Recording the sale creates the customer,
  order and license in one transaction. Codes are stored only as a SHA-256 hash + last 4 characters.
  The Envato-reported amount only counts as author earnings once staff confirm it.
- **Direct sales** recorded as completed orders get an INFIDEC license automatically.
- **Customer downloads**: `POST /api/downloads/authorize` with the customer's Firebase ID token
  (`Authorization: Bearer …`) and `{ "packageId" }`. The customer is resolved from the token
  (`customers.uid`), entitlement is checked (active account, active license for the package's
  product, released version) and a 15-minute signed URL is returned. Every request is logged.
  Staff can issue links on a customer's behalf from Downloads → Download Packages.
- **Refunds** are tracked, never processed: marketplace refunds happen on Envato, direct refunds in
  your gateway. Completing a full refund marks the order refunded and the license refunded.

### Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run lint` | ESLint |
| `npm run seed` | Seed roles/settings; bootstrap a Super Admin with `--admin-email` |
| `npm run catalog:extract` | Refresh the website catalogue snapshot for the import page |
| `npm run deploy:rules` | Deploy `firebase/firestore.rules`, indexes and `firebase/storage.rules` |
| `npm run functions:build` / `deploy:functions` | Build / deploy Cloud Functions (Blaze plan) |

If a functions deploy fails with *“User code failed to load … Timeout after 10000”*, the CLI needed more
than 10 s to load the code locally. Retry with a longer discovery timeout:
`FUNCTIONS_DISCOVERY_TIMEOUT=60 npm run deploy:functions` (Git Bash) or
`$env:FUNCTIONS_DISCOVERY_TIMEOUT=60; npm run deploy:functions` (PowerShell).
| `npm run emulators` | Local Firebase emulators |

## Architecture

```
src/
  app/
    (auth)/login, forgot-password       public pages
    (admin)/…                           every authenticated page (session verified in layout)
    api/auth/session/route.ts           ID token → httpOnly session cookie; logout + revocation
  proxy.ts                              optimistic cookie gate (real checks happen in the DAL)
  config/navigation.ts                  sidebar = spec §25, with permission + phase per entry
  lib/
    auth/session.ts                     Data Access Layer: getStaffSession / requirePermission / assertPermission
    rbac/                               permission model, default roles, Firestore role store
    firebase/                           client SDK, Admin SDK, collection names
    dashboard/                          real Firestore aggregations for the overview
    staff/                              staff service (keeps custom claims in sync)
    activity.ts                         append-only audit logging
firebase/                               security rules + indexes
functions/                              Cloud Functions (TypeScript)
scripts/seed.ts                         seeding + Super Admin bootstrap
```

### Authentication & sessions

1. The login form signs in with the Firebase client SDK (in-memory persistence only).
2. The fresh ID token is posted to `/api/auth/session`, which checks origin, rate limit, token
   revocation, recent sign-in, active staff record and verified email, then sets a 5-day
   `__session` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` in production).
3. Every layout, page, Server Action and Route Handler re-verifies the cookie with revocation
   checks and loads the staff record + role permissions (`src/lib/auth/session.ts`).
4. Role changes, disabling staff and sign-out revoke refresh tokens, so existing sessions die immediately.

### Role-based access control

Permissions are `module:action` (e.g. `products:publish`). Eight roles from the spec are seeded into
`roles/{roleId}`; Super Admin holds `*`. Roles & Permissions lets authorised staff edit the matrix,
with guards against editing your own role, granting permissions you don't hold, and removing the
last Super Admin. Staff carry `{ staff: true, role }` custom claims so Security Rules can enforce
access for any direct client reads.

### Data honesty

The dashboard only shows figures computed from Firestore records. Gross sales, marketplace author
earnings and direct website revenue are always shown separately; with no data, cards show zero and
charts show empty states. A section that can't load (for example a missing index) shows
"Unavailable" rather than a guess.

More detail: [docs/DATABASE.md](docs/DATABASE.md).

## Security notes

- Service-account keys live in `secret/` and are git-ignored; nothing secret is exposed to the browser.
- Firestore and Storage rules deny by default; source packages are never client-readable.
- Security headers (frame-deny, nosniff, HSTS, referrer and permissions policy) are set in `next.config.ts`.
- App Check activates when `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` is set — configure it before production.
