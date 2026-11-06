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
| 6 | Website sync, email, analytics, reports, activity logs | **Done** |
| 7 | Security & performance testing, production deployment | Planned |

Every sidebar entry from the spec is now a working module.

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

### Website sync, email, analytics & reports (Phase 6)

- **Infidec Website** (Integrations → Infidec Website) reads the website's Firestore
  (`marketplace-infidec`) with a service-account key stored encrypted in
  `integrationSettings/website`. Access is **read-only** and uses explicit field lists, so customer
  password hashes are never fetched. *Sync now* imports website accounts as customers (matched by
  email) and each order item as a direct INFIDEC order with id `web_<orderId>_<n>`, so re-running is
  safe. The website marks orders paid without a gateway, so imports are always **pending /
  unverified** — confirm the payment and mark the order completed to issue the license. *Preview*
  shows what would change without writing. *Check live prices* compares product prices with each
  live product page (JSON-LD + price labels) and can copy the website's prices.
- **SMTP & Email** uses `MAIL_HOST/PORT/USERNAME/PASSWORD/FROM_ADDRESS/FROM_NAME` (password in Secret
  Manager). Nine templates (purchase, license verified, new release, product update, ticket
  created/reply, refund status, download link, registration) can be edited, previewed and switched
  on/off. Every attempt is logged in `notifications`. The support email from General Settings is
  used as reply-to.
- **Analytics** covers revenue per currency, products, channels, order status/sources, license
  types, downloads & version adoption, verifications, customers, tickets, refunds and email.
- **Reports**: 11 reports (product, marketplace and direct sales, revenue, customers, licenses,
  downloads, refunds, tickets, version adoption, storage usage) with product / marketplace / date
  filters, CSV export (`/api/reports`, formula-injection safe) and a print/PDF view
  (`/report-print`). Requires `reports:export`; every export is logged.
- **Activity logs** export the last 30 days as CSV (`activity:export`).
- **General Settings**: platform name, support email, base currency, upload limit, download-link
  lifetime.

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

## Deploying (https://infidec-admin.web.app)

The admin renders on the server, so it runs on **Firebase App Hosting** (backend `infidec-admin`,
region `asia-southeast1` — App Hosting isn't offered in `asia-south1`):
https://infidec-admin--infidec-admin.asia-southeast1.hosted.app

**https://infidec-admin.web.app** (Firebase Hosting) serves the admin directly: `firebase.json` →
`hosting.rewrites` forwards every request to the App Hosting Cloud Run service. Hosting only forwards
the `__session` cookie, which is the cookie the admin uses.

One-time requirement (already done): the Cloud Run service `infidec-admin` (asia-southeast1) must
allow public access — Cloud Run → infidec-admin → Permissions → `allUsers` = **Cloud Run Invoker**.
Without it Hosting gets 403. Every page and API still requires a staff session. The setting
survives App Hosting deploys; re-apply it only if the backend is deleted and recreated.

All displayed dates use `NEXT_PUBLIC_APP_TIME_ZONE` (default `Asia/Kolkata`) so the server (UTC) and
the browser render identical text.

Configuration lives in `apphosting.yaml` (public values) and Cloud Secret Manager (credentials).
One-time secret setup (values are piped from your local files, never typed or committed):

```bash
node -e "process.stdout.write(require('./secret/infidec-admin-firebase-private-key.json').private_key)"   | firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY --data-file -
grep '^INTEGRATION_ENCRYPTION_KEY=' .env.local | cut -d= -f2- | tr -d '
'   | firebase apphosting:secrets:set INTEGRATION_ENCRYPTION_KEY --data-file -
grep '^MAIL_PASSWORD=' .env.local | cut -d= -f2- | tr -d '
'   | firebase apphosting:secrets:set MAIL_PASSWORD --data-file -
for s in FIREBASE_PRIVATE_KEY INTEGRATION_ENCRYPTION_KEY MAIL_PASSWORD; do
  firebase apphosting:secrets:grantaccess $s --backend infidec-admin --location asia-southeast1
done
```

`INTEGRATION_ENCRYPTION_KEY` must be the same key that encrypted the stored Envato/Razorpay
credentials, otherwise they can't be decrypted.

Deploy (uploads local source; `secret/`, `.env*` and `functions/` are excluded):

```bash
firebase deploy --only apphosting   # build + run the app
firebase deploy --only hosting      # serve the app on infidec-admin.web.app
```

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
