import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { STORAGE_RULES_MAX_MB } from "@/lib/packages/service";

import type { GeneralSettings } from "./schema";

export { generalSettingsSchema, type GeneralSettings } from "./schema";

const ref = () => adminDb.collection(COLLECTIONS.systemSettings).doc("general");

export async function getGeneralSettings(): Promise<GeneralSettings & { updatedAt: string | null; updatedByEmail: string | null }> {
  const d = (await ref().get()).data() ?? {};
  return {
    platformName: String(d.platformName ?? "INFIDEC"),
    supportEmail: String(d.supportEmail ?? ""),
    baseCurrency: d.baseCurrency === "USD" ? "USD" : "INR",
    maxUploadSizeMb: Math.min(Number(d.maxUploadSizeMb ?? STORAGE_RULES_MAX_MB), STORAGE_RULES_MAX_MB),
    signedUrlTtlMinutes: Math.min(Math.max(Number(d.signedUrlTtlMinutes ?? 15), 1), 60),
    updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate().toISOString() : null,
    updatedByEmail: d.updatedByEmail ?? null,
  };
}

export async function saveGeneralSettings(values: GeneralSettings, actor: { uid: string; email: string }) {
  const before = await getGeneralSettings();
  await ref().set({ ...values, updatedBy: actor.uid, updatedByEmail: actor.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const changed = (Object.keys(values) as (keyof GeneralSettings)[]).filter((k) => values[k] !== before[k]);
  return { changed, before };
}
