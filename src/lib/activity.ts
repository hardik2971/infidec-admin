import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

type ActivityDomain =
  | "auth"
  | "staff"
  | "role"
  | "system"
  | "product"
  | "category"
  | "version"
  | "package"
  | "storage"
  | "settings"
  | "doc"
  | "customer"
  | "order"
  | "license"
  | "envato"
  | "download"
  | "listing"
  | "ticket"
  | "refund"
  | "integration";

/** "<domain>.<event>", e.g. "product.created". */
export type ActivityAction = `${ActivityDomain}.${string}`;

export interface ActivityEntry {
  action: ActivityAction;
  actorId: string | null;
  actorEmail?: string | null;
  targetType?: string;
  targetId?: string;
  productId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends an immutable audit record. Logging must never break the operation
 * being audited, so failures are reported to the server log only.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await adminDb.collection(COLLECTIONS.activityLogs).add({
      ...entry,
      domain: entry.action.split(".")[0],
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("[activity] failed to write audit log", entry.action, error);
  }
}
