/** Firestore collection names — the single source of truth for the data model. */
export const COLLECTIONS = {
  users: "users",
  staff: "staff",
  roles: "roles",
  permissions: "permissions",
  products: "products",
  productCategories: "productCategories",
  marketplaces: "marketplaces",
  productListings: "productListings",
  productPackages: "productPackages",
  productVersions: "productVersions",
  productDocumentation: "productDocumentation",
  productMedia: "productMedia",
  customers: "customers",
  orders: "orders",
  orderItems: "orderItems",
  licenses: "licenses",
  licenseVerifications: "licenseVerifications",
  downloadLogs: "downloadLogs",
  supportTickets: "supportTickets",
  refunds: "refunds",
  notifications: "notifications",
  activityLogs: "activityLogs",
  integrationSettings: "integrationSettings",
  systemSettings: "systemSettings",
  /** Server-tracked staging uploads (internal). */
  uploadSessions: "uploadSessions",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
