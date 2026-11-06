import { ALL_PERMISSIONS, MODULE_ACTIONS, type Module, type Permission } from "./permissions";

export const ROLE_IDS = [
  "super_admin",
  "product_manager",
  "documentation_manager",
  "order_manager",
  "license_manager",
  "support_manager",
  "finance_manager",
  "read_only",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
  permissions: Permission[];
  /** System roles cannot be deleted; Super Admin permissions cannot be edited. */
  locked: boolean;
}

function grant(modules: Module[], filter?: (p: Permission) => boolean): Permission[] {
  return modules
    .flatMap((m) => MODULE_ACTIONS[m].map((a) => `${m}:${a}` as Permission))
    .filter((p) => (filter ? filter(p) : true));
}

const viewOnly = (p: Permission) => p.endsWith(":view");
const BASE: Permission[] = ["dashboard:view"];

export const DEFAULT_ROLES: Record<RoleId, RoleDefinition> = {
  super_admin: {
    id: "super_admin",
    name: "Super Admin",
    description: "Unrestricted access to every module, setting and staff account.",
    permissions: ["*"],
    locked: true,
  },
  product_manager: {
    id: "product_manager",
    name: "Product Manager",
    description: "Manages products, listings, source packages and versions.",
    permissions: [
      ...BASE,
      ...grant(["products", "categories", "listings", "packages", "versions"]),
      ...grant(["storage", "documentation", "analytics"], viewOnly),
    ],
    locked: false,
  },
  documentation_manager: {
    id: "documentation_manager",
    name: "Documentation Manager",
    description: "Authors and publishes product documentation and changelogs.",
    permissions: [
      ...BASE,
      ...grant(["documentation"]),
      ...grant(["products", "versions"], viewOnly),
    ],
    locked: false,
  },
  order_manager: {
    id: "order_manager",
    name: "Order Manager",
    description: "Manages orders, purchase records and customers.",
    permissions: [
      ...BASE,
      ...grant(["orders", "customers"]),
      ...grant(["products", "licenses", "refunds"], viewOnly),
    ],
    locked: false,
  },
  license_manager: {
    id: "license_manager",
    name: "License Manager",
    description: "Verifies purchase codes and manages license records and downloads.",
    permissions: [
      ...BASE,
      ...grant(["licenses", "downloads"]),
      ...grant(["products", "orders", "customers"], viewOnly),
    ],
    locked: false,
  },
  support_manager: {
    id: "support_manager",
    name: "Support Manager",
    description: "Handles support tickets and customer conversations.",
    permissions: [
      ...BASE,
      ...grant(["support"]),
      ...grant(["products", "customers", "licenses", "orders", "documentation"], viewOnly),
    ],
    locked: false,
  },
  finance_manager: {
    id: "finance_manager",
    name: "Finance Manager",
    description: "Reviews revenue, refunds and financial reports.",
    permissions: [
      ...BASE,
      ...grant(["refunds", "reports", "analytics"]),
      ...grant(["orders", "customers", "products"], viewOnly),
      "orders:export",
    ],
    locked: false,
  },
  read_only: {
    id: "read_only",
    name: "Read Only Staff",
    description: "Can view every operational module but cannot change anything.",
    permissions: ALL_PERMISSIONS.filter(
      (p) => viewOnly(p) && !p.startsWith("staff:") && !p.startsWith("roles:") && !p.startsWith("integrations:"),
    ),
    locked: false,
  },
};

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);
}
