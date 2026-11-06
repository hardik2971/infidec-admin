/**
 * Role-based access control model.
 *
 * A permission is `${module}:${action}`. Roles hold a list of permissions;
 * the special permission "*" grants everything (Super Admin only).
 *
 * This file is shared by server code, client UI (to hide controls), the
 * seeding script and documentation. Authorization is always re-checked on
 * the server; client checks are cosmetic.
 */

export const MODULES = [
  "dashboard",
  "analytics",
  "products",
  "categories",
  "listings",
  "packages",
  "versions",
  "storage",
  "documentation",
  "orders",
  "customers",
  "licenses",
  "downloads",
  "support",
  "refunds",
  "reports",
  "integrations",
  "staff",
  "roles",
  "activity",
  "settings",
] as const;

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "upload",
  "download",
  "publish",
  "approve",
  "export",
  "manage_settings",
] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Module}:${Action}` | "*";

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  products: "Products",
  categories: "Categories",
  listings: "Marketplace Listings",
  packages: "Source Packages",
  versions: "Versions",
  storage: "Storage",
  documentation: "Documentation",
  orders: "Orders",
  customers: "Customers",
  licenses: "Licenses",
  downloads: "Downloads",
  support: "Support",
  refunds: "Refunds",
  reports: "Reports",
  integrations: "Integrations",
  staff: "Staff",
  roles: "Roles & Permissions",
  activity: "Activity Logs",
  settings: "Settings",
};

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  upload: "Upload",
  download: "Download",
  publish: "Publish",
  approve: "Approve",
  export: "Export",
  manage_settings: "Manage Settings",
};

/** Actions that are meaningful per module; keeps the permission matrix honest. */
export const MODULE_ACTIONS: Record<Module, readonly Action[]> = {
  dashboard: ["view"],
  analytics: ["view", "export"],
  products: ["view", "create", "edit", "delete", "publish", "export"],
  categories: ["view", "create", "edit", "delete"],
  listings: ["view", "create", "edit", "delete", "publish", "approve"],
  packages: ["view", "upload", "download", "edit", "delete"],
  versions: ["view", "create", "edit", "delete", "publish"],
  storage: ["view", "delete", "manage_settings"],
  documentation: ["view", "create", "edit", "delete", "upload", "publish", "export"],
  orders: ["view", "create", "edit", "export"],
  customers: ["view", "create", "edit", "delete", "export"],
  licenses: ["view", "create", "edit", "approve", "export"],
  downloads: ["view", "download", "export"],
  support: ["view", "create", "edit", "delete"],
  refunds: ["view", "create", "edit", "approve", "export"],
  reports: ["view", "export"],
  integrations: ["view", "edit", "manage_settings"],
  staff: ["view", "create", "edit", "delete"],
  roles: ["view", "edit"],
  activity: ["view", "export"],
  settings: ["view", "manage_settings"],
};

export const ALL_PERMISSIONS: Permission[] = MODULES.flatMap((m) =>
  MODULE_ACTIONS[m].map((a) => `${m}:${a}` as Permission),
);

export function isPermission(value: string): value is Permission {
  return value === "*" || (ALL_PERMISSIONS as string[]).includes(value);
}

export function hasPermission(
  granted: readonly string[] | undefined,
  required: Permission,
): boolean {
  if (!granted) return false;
  return granted.includes("*") || granted.includes(required);
}

export function hasAnyPermission(
  granted: readonly string[] | undefined,
  required: readonly Permission[],
): boolean {
  return required.some((p) => hasPermission(granted, p));
}
