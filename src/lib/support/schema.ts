import { z } from "zod";

export const TICKET_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_customer: "Waiting for Customer",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DEFAULT_CATEGORIES = [
  "Installation",
  "Configuration",
  "Technical Support",
  "Bug Report",
  "Payment",
  "License",
  "Customization",
  "General Inquiry",
];

export const ticketSchema = z.object({
  customerId: z.string().min(1, "Choose the customer."),
  productId: z.string().min(1, "Choose the product."),
  subject: z.string().trim().min(4, "Write a subject.").max(160),
  category: z.string().trim().min(1).max(60),
  priority: z.enum(PRIORITIES),
  body: z.string().trim().min(1, "Describe the request.").max(20_000),
});
export type TicketValues = z.infer<typeof ticketSchema>;

export interface TicketAttachment {
  name: string;
  size: number;
  contentType: string;
  storagePath: string;
}

export interface TicketRecord {
  id: string;
  number: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: Priority;
  productId: string;
  customerId: string;
  assignedTo: string | null;
  assignedToName: string | null;
  entitlement: { supported: boolean; supportExpiry: string | null; licenseId: string | null; checkedAt: string | null } | null;
  messageCount: number;
  lastMessageBy: "customer" | "staff" | null;
  lastMessageAt: string | null;
  createdAt: string | null;
}

export interface TicketMessage {
  id: string;
  authorType: "customer" | "staff";
  authorName: string;
  body: string;
  internal: boolean;
  attachments: TicketAttachment[];
  createdAt: string | null;
}
