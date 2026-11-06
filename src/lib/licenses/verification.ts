import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { EnvatoError, lookupSale, PURCHASE_CODE_RE, type EnvatoSale } from "@/lib/integrations/envato";
import { findLicenseByPurchaseCode, hashPurchaseCode } from "@/lib/sales/service";
import type { LicenseRecord } from "@/lib/sales/schema";

export type VerificationOutcome =
  | { status: "valid"; sale: EnvatoSale; product: { id: string; name: string } | null }
  | { status: "already_recorded"; license: LicenseRecord }
  | { status: "invalid" }
  | { status: "error"; message: string };

async function log(entry: Record<string, unknown>) {
  await adminDb.collection(COLLECTIONS.licenseVerifications).add({ ...entry, createdAt: FieldValue.serverTimestamp() });
}

/** Verifies a purchase code against the official Envato API. Never invents or issues codes. */
export async function verifyPurchaseCode(rawCode: string, actor: { uid: string; email: string }): Promise<VerificationOutcome> {
  const code = rawCode.trim().toLowerCase();
  const base = { codeHash: hashPurchaseCode(code), codeLast4: code.slice(-4), verifiedBy: actor.uid, verifiedByEmail: actor.email, marketplace: "envato" };

  if (!PURCHASE_CODE_RE.test(code)) {
    await log({ ...base, result: "invalid_format" });
    return { status: "error", message: "That doesn't look like an Envato purchase code (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)." };
  }

  const existing = await findLicenseByPurchaseCode(code);
  if (existing) {
    await log({ ...base, result: "already_recorded", licenseId: existing.id, productId: existing.productId });
    return { status: "already_recorded", license: existing };
  }

  let sale: EnvatoSale | null;
  try {
    sale = await lookupSale(code);
  } catch (error) {
    const message = error instanceof EnvatoError ? error.message : "Verification failed unexpectedly.";
    await log({ ...base, result: "error", error: message });
    if (!(error instanceof EnvatoError)) console.error("[verify]", error);
    return { status: "error", message };
  }

  if (!sale) {
    await log({ ...base, result: "invalid" });
    return { status: "invalid" };
  }

  const match = await adminDb.collection(COLLECTIONS.products).where("marketplaceItemId", "==", String(sale.item.id)).limit(1).get();
  const product = match.empty ? null : { id: match.docs[0].id, name: String(match.docs[0].get("name")) };
  await log({
    ...base,
    result: "valid",
    itemId: String(sale.item.id),
    itemName: sale.item.name,
    productId: product?.id ?? null,
    buyer: sale.buyer,
    license: sale.license,
    soldAt: sale.soldAt,
    supportedUntil: sale.supportedUntil,
    reportedAmount: sale.amount,
  });
  return { status: "valid", sale, product };
}

export interface VerificationLog {
  id: string;
  result: string;
  codeLast4: string;
  itemName: string | null;
  productId: string | null;
  buyer: string | null;
  license: string | null;
  error: string | null;
  verifiedByEmail: string;
  createdAt: string | null;
}

export async function listVerificationLogs(limit = 500): Promise<VerificationLog[]> {
  const snap = await adminDb.collection(COLLECTIONS.licenseVerifications).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({
    id: d.id,
    result: String(d.get("result")),
    codeLast4: String(d.get("codeLast4") ?? ""),
    itemName: d.get("itemName") ?? null,
    productId: d.get("productId") ?? null,
    buyer: d.get("buyer") ?? null,
    license: d.get("license") ?? null,
    error: d.get("error") ?? null,
    verifiedByEmail: String(d.get("verifiedByEmail") ?? ""),
    createdAt: d.get("createdAt") instanceof Timestamp ? d.get("createdAt").toDate().toISOString() : null,
  }));
}
