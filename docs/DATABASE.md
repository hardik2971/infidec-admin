# Database reference

Cloud Firestore holds structured metadata; binaries live in private Firebase Storage. Every
product-scoped document carries `productId`. Collection names are defined once in
`src/lib/firebase/collections.ts`.

## Conventions

- Timestamps are Firestore `Timestamp`s (`createdAt`, `updatedAt`, set with `serverTimestamp()`).
- Money is stored as integers in **minor units** (cents) with an ISO `currency` code.
- Writes go through the server (Admin SDK) after a permission check; client writes are denied by rules.
- Related updates use transactions or batched writes.

## Collections in use (Phase 1)

### `staff/{uid}`
| Field | Type | Notes |
| ----- | ---- | ----- |
| uid, email, displayName | string | |
| roleId | string | one of the ids in `roles` |
| status | `"active" \| "disabled"` | disabled staff cannot sign in |
| createdBy, updatedBy | string | uid of the actor, or `"seed"` |
| createdAt, updatedAt, lastLoginAt | Timestamp | |

Custom claims `{ staff: true, role }` mirror this document (server action + `syncStaffClaims` function).

### `roles/{roleId}`
`id`, `name`, `description`, `permissions: string[]` (`module:action`, or `*`), `locked`, `system`.

### `activityLogs/{id}` (append-only)
`action` (e.g. `auth.login`, `staff.role_changed`), `actorId`, `actorEmail`, `targetType`,
`targetId`, `productId?`, `summary`, `metadata`, `ip`, `userAgent`, `createdAt`.

### `systemSettings/general`
`platformName`, `baseCurrency` (default `USD`), `timezone`, `maxUploadSizeMb`,
`allowedPackageMimeTypes`, `signedUrlTtlMinutes`.

### `marketplaces/{id}`
`envato` (Envato Market / CodeCanyon) and `infidec` (direct website): `name`, `type`
(`marketplace` | `direct`), `website`, `status`.

## Products (Phase 2)

### `products/{productId}`
| Field | Notes |
| ----- | ----- |
| status | `draft`, `in_review`, `published`, `suspended`, `archived` |
| name, nameKey, slug | `slug` is unique (enforced in transactions); `nameKey` = slugified name for duplicate detection |
| title, tagline, shortDescription, fullDescription | |
| categoryId, productType | `productType`: app, addon, theme, plugin, script, other |
| version, releaseDate | semver; `yyyy-MM-dd` |
| platform, techStack[], integrations[], modules[] | |
| demoUrl, demoLinks[], websiteUrl | |
| marketplaceId, marketplaceItemId, marketplaceUrl | |
| pricing { currency, regular, extended, compareAt } | minor units (paise/cents); `extended` null when not offered |
| licenseTypes { regular, extended, custom }, supportDurationMonths, licenseNotes | |
| seo { title, description, keywords[], canonicalUrl } | |
| features[{ title, subtitle, items[{title,text}] }], requirements[{title,text}], whatYouGet[] | |
| thumbnailMediaId, logoMediaId | point at `productMedia` |
| source | `{ type: "manual" }` or `{ type: "website-import", url, sourceSlug, commit, importedAt }` |
| wizard | `{ completedSteps[], lastStep }` while a wizard draft is in progress |
| createdAt/By, updatedAt/By, publishedAt | |

Publishing requires: name, category, short + full description, thumbnail, regular price, SEO title and description.
Products with orders, licenses, packages or versions cannot be deleted — archive them.

### `productMedia/{mediaId}`
`productId`, `kind` (logo | thumbnail | screenshot), `alt`, `section`, `order`, `storagePath`,
`contentType`, `size`, `width`, `height`, `sha256`, `source`, `uploadedBy`, `createdAt`.
Images are PNG/JPEG/WebP only (checked by file signature and decoded), ≤ 15 MB, served to staff
through `/api/media/{id}` after a session and permission check.

### `productCategories/{id}`
`name`, `slug` (unique), `description`, `order`.

## Versions & packages (Phase 3)

### `productVersions/{versionId}`
`productId`, `version` (semver, unique per product), `status` (`draft` | `published` | `deprecated`),
`title`, `releaseDate`, `releaseNotes`, `newFeatures[]`, `improvements[]`, `bugFixes[]`,
`createdAt/By`, `publishedAt`, `deprecatedAt`. A version needs at least one active package to be published.

### `productPackages/{packageId}`
`productId`, `versionId`, `version`, `packageType` (complete_source, customer_app, delivery_app, website,
admin_panel, store_panel, backend, documentation, module), `name`, `fileName`, `fileSize`, `fileType`,
`sha256`, `storagePath`, `releaseNotes`, `status` (`active` | `replaced` | `deleted`),
`zip { entries, files, uncompressedBytes, topLevel[], sample[] }`, `replacesId`, `replacedById`,
`uploadedBy`, `uploadedByEmail`, `createdAt`. ZIP binaries are never stored in Firestore.

### `uploadSessions/{uploadId}` (internal)
Tracks a staging upload from registration to validation: `uid`, product/version/type, `fileName`,
`fileSize`, `stagingPath`, `status` (`pending` | `completed` | `failed` | `cancelled` | `expired`), `error`.

## Documentation, sales & support (Phases 4–5)

| Collection | Key fields |
| ---------- | ---------- |
| `productDocumentation` | productId, kind (section/page), parentId, order, status (draft/published), title, slug, summary, content (Markdown), videoUrl, attachments[], revision; subcollection `revisions` (last 50 versions) |
| `customers` | name, email (unique), phone, country, company, marketplaceUsername, status (active/suspended), productIds[], uid (customer login); subcollection `notes` |
| `orders` | orderNumber (ORD-YYYY-NNNNNN), customerId, productId, channel, marketplace, transactionRef, licenseType, purchaseDate, currency, grossAmount, authorEarnings, envatoReportedAmount, status, paymentStatus, refundStatus, verificationStatus, licenseId, source |
| `licenses` | licenseKey, productId, customerId, orderId, marketplace, licenseType, purchaseDate, supportExpiry, verificationStatus, status (active/refunded/revoked), purchaseCodeHash, purchaseCodeLast4, marketplaceBuyer, entitlement { versions }, source |
| `licenseVerifications` | codeHash, codeLast4, result (valid/invalid/already_recorded/error/invalid_format), itemId, itemName, productId, buyer, license, verifiedBy, createdAt |
| `downloadLogs` | customerId, productId, packageId, versionId, licenseId, result (authorized/denied), reason, issuedBy, ip, userAgent, expiresAt, createdAt |
| `supportTickets` | number (TKT-NNNNNN), subject, category, status, priority, productId, customerId, assignedTo, entitlement { supported, supportExpiry, licenseId, checkedAt }; subcollection `messages` (authorType, body, internal, attachments[]) |
| `refunds` | number (RFD-NNNNNN), orderId, customerId, productId, channel, marketplace, reason, amount, currency, status, adminNotes, history[] |
| `productListings` | productId, marketplaceId, status (draft → ready → submitted → under_review → approved/rejected → published), itemTitle, description, tags[], versionId, source/documentation package ids, media ids, changelog, requirements, checklist, rejectionNotes, resubmissions, itemId, history[] |
| `integrationSettings/{envato,razorpay,website}` | secret (AES-256-GCM, server-only), secretHint, publicConfig, lastTest*, lastError, rateLimitedUntil |
| `systemSettings/counters` | sequential order / ticket / refund numbers |


## Website sync, email & settings (Phase 6)

| Collection | Key fields |
| ---------- | ---------- |
| `customers` (website) | id `web_<websiteUserId>`, source "website", websiteUserId |
| `orders` (website) | id `web_<websiteOrderId>_<n>`, source "website", channel "direct", marketplace "infidec", status/paymentStatus "pending", verificationStatus "unverified", websiteOrderId, websiteStatus, websitePaymentMethod, websitePlan, websiteSyncedAt |
| `integrationSettings/website` | secret (encrypted service-account JSON), publicConfig { projectId, clientEmail, baseUrl }, lastSync { stats, at, byEmail } |
| `notifications` | channel "email", template, to, subject, status (sent/failed/skipped), error, messageId, related { type, id }, sentBy, createdAt |
| `systemSettings/email` | templates { key: { subject, body } } (overrides), enabled { key: bool } |
| `systemSettings/general` | platformName, supportEmail, baseCurrency (INR/USD), maxUploadSizeMb, signedUrlTtlMinutes, updatedBy |
| `productVersions` | notifiedAt, notifiedCounts (after "Notify customers") |
| `supportTickets/*/messages` | emailStatus (pending/sent/failed/not_applicable), emailError |

The website project is never written to.

`activityLogs` entries carry `domain` (the part of `action` before the dot) for filtering.

## Fields the dashboard reads (later phases write them)

| Collection | Fields |
| ---------- | ------ |
| `products` | `name`, `status` (`draft`, `in_review`, `published`, `suspended`, `archived`) |
| `orders` | `productId`, `channel` (`marketplace` \| `direct`), `marketplace`, `grossAmount`, `authorEarnings`, `currency`, `status`, `purchaseDate` |
| `customers` | `productIds: string[]`, `createdAt` |
| `licenses` | `productId`, `licenseType` (`regular` \| `extended` \| `custom`), `status` |
| `downloadLogs` | `productId`, `customerId`, `createdAt` |
| `productPackages` | `productId`, `status`, `fileSize` (bytes) |
| `supportTickets` | `productId`, `status` (`open`, `in_progress`, `waiting_customer`, `resolved`, `closed`) |

Revenue earned = marketplace `authorEarnings` + direct `grossAmount` for orders with status
`completed` or `partially_refunded`.

## Storage layout

```
products/{productId}/source-code/{versionId}/*.zip     private, server-signed downloads only
products/{productId}/documentation/**                  private
products/{productId}/media/**                          staff-readable
products/{productId}/releases/{versionId}/**           private
uploads/staging/{uid}/**                               upload staging, validated server-side
```

## Indexes

Composite indexes are declared in `firebase/firestore.indexes.json` and deployed with
`npm run deploy:rules`.
