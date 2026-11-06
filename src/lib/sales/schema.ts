/** Customers, orders and licenses — shared client/server model. */
import { z } from "zod";

export const CUSTOMER_STATUSES = ["active", "suspended"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const ORDER_STATUSES = ["pending", "completed", "failed", "cancelled", "refunded", "partially_refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
};

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const VERIFICATION_STATUSES = ["unverified", "verified", "failed"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CHANNELS = ["marketplace", "direct"] as const;
export type Channel = (typeof CHANNELS)[number];

export const LICENSE_TYPES = ["regular", "extended", "custom"] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];
export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = { regular: "Regular", extended: "Extended", custom: "Custom" };

export const LICENSE_STATUSES = ["active", "refunded", "revoked"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const MARKETPLACE_LABELS: Record<string, string> = { envato: "Envato (CodeCanyon)", infidec: "INFIDEC Website" };
export const marketplaceLabel = (id: string) => MARKETPLACE_LABELS[id] ?? id;

const optionalText = (max: number) => z.string().trim().max(max);

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: optionalText(40),
  country: optionalText(60),
  company: optionalText(120),
  marketplaceUsername: optionalText(80),
});
export type CustomerValues = z.infer<typeof customerSchema>;

export const orderSchema = z
  .object({
    customerId: z.string().min(1, "Choose a customer."),
    productId: z.string().min(1, "Choose a product."),
    channel: z.enum(CHANNELS),
    marketplace: z.string().trim().min(1).max(40),
    transactionRef: optionalText(120),
    licenseType: z.enum(LICENSE_TYPES),
    purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the purchase date."),
    currency: z.enum(["INR", "USD"]),
    grossAmount: z.number({ error: "Enter the amount." }).min(0).max(100_000_000),
    authorEarnings: z.number().min(0).max(100_000_000).nullable(),
    status: z.enum(ORDER_STATUSES),
    paymentStatus: z.enum(PAYMENT_STATUSES),
    notes: optionalText(2000),
  })
  .refine((v) => v.channel === "marketplace" || v.authorEarnings === null || v.authorEarnings <= v.grossAmount, {
    path: ["authorEarnings"],
    message: "Earnings can't exceed the gross amount.",
  });
export type OrderValues = z.infer<typeof orderSchema>;

export interface CustomerRecord extends CustomerValues {
  id: string;
  status: CustomerStatus;
  productIds: string[];
  uid: string | null;
  orderCount: number;
  createdAt: string | null;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerId: string;
  productId: string;
  channel: Channel;
  marketplace: string;
  transactionRef: string;
  licenseType: LicenseType;
  purchaseDate: string | null;
  currency: string;
  grossAmount: number; // minor units
  authorEarnings: number | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  refundStatus: "none" | "requested" | "partial" | "full";
  verificationStatus: VerificationStatus;
  licenseId: string | null;
  source: string;
  notes: string;
  createdAt: string | null;
}

export interface LicenseRecord {
  id: string;
  licenseKey: string;
  productId: string;
  customerId: string;
  orderId: string | null;
  marketplace: string;
  licenseType: LicenseType;
  purchaseDate: string | null;
  supportExpiry: string | null;
  verificationStatus: VerificationStatus;
  status: LicenseStatus;
  purchaseCodeLast4: string | null;
  marketplaceBuyer: string | null;
  source: "envato" | "direct" | "manual";
  createdAt: string | null;
}

export function supportActive(l: Pick<LicenseRecord, "supportExpiry" | "status">, now = new Date()) {
  return l.status === "active" && !!l.supportExpiry && new Date(l.supportExpiry) >= now;
}

/** Active, supported licenses whose support ends within `days`. */
export function supportEndingWithin(licenses: Pick<LicenseRecord, "supportExpiry" | "status">[], days: number, now = Date.now()) {
  return licenses.filter((l) => supportActive(l, new Date(now)) && new Date(l.supportExpiry!).getTime() - now < days * 86_400_000);
}
