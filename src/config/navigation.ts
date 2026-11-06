import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  CreditCard,
  Database,
  Download,
  FileArchive,
  FileClock,
  Flame,
  FolderTree,
  GitBranch,
  Globe,
  HardDrive,
  History,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  Package,
  PackagePlus,
  PieChart,
  PlugZap,
  Receipt,
  ReceiptText,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  Upload,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  /** Development phase (spec §26) in which the module ships. */
  phase: number;
  description: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Phase that is currently implemented; items beyond it render a roadmap page. */
export const CURRENT_PHASE = 6;

export const NAVIGATION: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard:view", phase: 1, description: "Live business overview across every product." },
      { title: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics:view", phase: 6, description: "Sales, license, download, support and email analytics." },
    ],
  },
  {
    title: "Product Management",
    items: [
      { title: "All Products", href: "/products", icon: Boxes, permission: "products:view", phase: 2, description: "Manage the full multi-product catalogue." },
      { title: "Add New Product", href: "/products/new", icon: PackagePlus, permission: "products:create", phase: 2, description: "Eight-step product creation wizard with draft saving." },
      { title: "Categories", href: "/products/categories", icon: FolderTree, permission: "categories:view", phase: 2, description: "Organise products into categories." },
      { title: "Marketplace Listings", href: "/products/listings", icon: Store, permission: "listings:view", phase: 5, description: "CodeCanyon and marketplace submission manager, alongside the Envato integration." },
    ],
  },
  {
    title: "Source Code Management",
    items: [
      { title: "All Packages", href: "/packages", icon: Package, permission: "packages:view", phase: 3, description: "Every source ZIP across products and versions." },
      { title: "Upload ZIP", href: "/packages/upload", icon: Upload, permission: "packages:upload", phase: 3, description: "Validated, checksummed uploads to private storage." },
      { title: "Version Management", href: "/versions", icon: GitBranch, permission: "versions:view", phase: 3, description: "Independent version history for each product." },
      { title: "Storage Management", href: "/storage", icon: HardDrive, permission: "storage:view", phase: 3, description: "Storage usage, limits and cleanup." },
    ],
  },
  {
    title: "Documentation",
    items: [
      { title: "Documentation CMS", href: "/documentation", icon: BookOpen, permission: "documentation:view", phase: 4, description: "Rich documentation with nested categories and versions." },
      { title: "Document Library", href: "/documentation/library", icon: FileArchive, permission: "documentation:view", phase: 4, description: "PDF manuals, ZIP bundles and videos." },
      { title: "Installation Guides", href: "/documentation/installation", icon: ListChecks, permission: "documentation:view", phase: 4, description: "Step-by-step setup guides per product." },
      { title: "Changelogs", href: "/documentation/changelogs", icon: FileClock, permission: "documentation:view", phase: 4, description: "Release notes for every version." },
    ],
  },
  {
    title: "Sales & Customers",
    items: [
      { title: "Orders", href: "/orders", icon: ShoppingCart, permission: "orders:view", phase: 4, description: "Marketplace and direct purchase records." },
      { title: "Customers", href: "/customers", icon: Users, permission: "customers:view", phase: 4, description: "Customer accounts, purchases and history." },
      { title: "Marketplace Sales", href: "/sales/marketplace", icon: ShoppingBag, permission: "orders:view", phase: 4, description: "CodeCanyon and other marketplace sales." },
      { title: "Direct Sales", href: "/sales/direct", icon: Receipt, permission: "orders:view", phase: 4, description: "Sales through the INFIDEC website." },
    ],
  },
  {
    title: "License Management",
    items: [
      { title: "All Licenses", href: "/licenses", icon: KeyRound, permission: "licenses:view", phase: 4, description: "Regular, extended and custom licenses." },
      { title: "Verify Purchase Code", href: "/licenses/verify", icon: ShieldCheck, permission: "licenses:view", phase: 5, description: "Verify Envato purchase codes via the official API." },
      { title: "License Activations", href: "/licenses/activations", icon: Activity, permission: "licenses:view", phase: 4, description: "Support entitlement and ownership records." },
      { title: "Verification Logs", href: "/licenses/logs", icon: ScrollText, permission: "licenses:view", phase: 5, description: "Audit trail of every verification." },
    ],
  },
  {
    title: "Downloads",
    items: [
      { title: "Download Packages", href: "/downloads", icon: Download, permission: "downloads:view", phase: 5, description: "Entitlement-checked customer downloads." },
      { title: "Download History", href: "/downloads/history", icon: History, permission: "downloads:view", phase: 5, description: "Every authorised download, logged." },
    ],
  },
  {
    title: "Customer Support",
    items: [
      { title: "Support Tickets", href: "/support", icon: LifeBuoy, permission: "support:view", phase: 5, description: "Ticket conversations, assignment and priorities." },
      { title: "Support Categories", href: "/support/categories", icon: Tags, permission: "support:view", phase: 5, description: "Ticket categories and routing." },
    ],
  },
  {
    title: "Finance",
    items: [
      { title: "Refund Requests", href: "/refunds", icon: RotateCcw, permission: "refunds:view", phase: 5, description: "Open refund requests awaiting review." },
      { title: "Refund History", href: "/refunds/history", icon: ReceiptText, permission: "refunds:view", phase: 5, description: "Completed and rejected refunds." },
      { title: "Financial Reports", href: "/reports", icon: PieChart, permission: "reports:view", phase: 6, description: "Revenue, sales and refund reports with export." },
    ],
  },
  {
    title: "Integrations",
    items: [
      { title: "Envato API", href: "/integrations/envato", icon: PlugZap, permission: "integrations:view", phase: 5, description: "Official Envato Market API credentials and sync." },
      { title: "Infidec Website", href: "/integrations/website", icon: Globe, permission: "integrations:view", phase: 6, description: "Customer & order import and price checks with the website." },
      { title: "Payment Gateways", href: "/integrations/payments", icon: CreditCard, permission: "integrations:view", phase: 5, description: "Direct-sale payment gateway settings." },
      { title: "SMTP", href: "/integrations/smtp", icon: Mail, permission: "integrations:view", phase: 6, description: "Outgoing email, templates and logs." },
      { title: "Firebase Settings", href: "/integrations/firebase", icon: Flame, permission: "integrations:view", phase: 1, description: "Firebase project configuration and health." },
    ],
  },
  {
    title: "System",
    items: [
      { title: "Staff Management", href: "/system/staff", icon: UserCog, permission: "staff:view", phase: 1, description: "Staff accounts, roles and access." },
      { title: "Roles & Permissions", href: "/system/roles", icon: ShieldCheck, permission: "roles:view", phase: 1, description: "Role-based access control matrix." },
      { title: "Activity Logs", href: "/system/activity", icon: Database, permission: "activity:view", phase: 1, description: "Immutable audit trail of staff activity." },
      { title: "General Settings", href: "/system/settings", icon: Settings, permission: "settings:view", phase: 6, description: "Currency, upload limits and platform settings." },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((s) => s.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((i) => i.href === pathname);
}

