/** Refund model shared by client and server. */
import { z } from "zod";

export const REFUND_STATUSES = ["requested", "under_review", "approved", "rejected", "completed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: "Requested",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

/** Allowed transitions; rejected and completed are final. */
export const NEXT_STATUSES: Record<RefundStatus, RefundStatus[]> = {
  requested: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["completed", "rejected"],
  rejected: [],
  completed: [],
};

export const refundRequestSchema = z.object({
  orderId: z.string().min(1, "Choose the order."),
  reason: z.string().trim().min(5, "Describe the reason.").max(2000),
  amount: z.number({ error: "Enter the amount." }).positive("The amount must be positive."),
});

export interface RefundRecord {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  productId: string;
  channel: "marketplace" | "direct";
  marketplace: string;
  reason: string;
  amount: number; // minor units
  currency: string;
  status: RefundStatus;
  adminNotes: string;
  history: { status: RefundStatus; note: string; byEmail: string; at: string | null }[];
  createdAt: string | null;
}
