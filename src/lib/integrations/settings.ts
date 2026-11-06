import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

export type IntegrationId = "envato" | "razorpay";

/** Public (non-secret) view of an integration — safe to send to the browser. */
export interface IntegrationStatus {
  configured: boolean;
  source: "firestore" | "environment" | null;
  secretHint: string | null;
  publicConfig: Record<string, string>;
  configuredAt: string | null;
  configuredByEmail: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  rateLimitedUntil: string | null;
}

const ref = (id: IntegrationId) => adminDb.collection(COLLECTIONS.integrationSettings).doc(id);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
const ENV_SECRET: Record<IntegrationId, string | undefined> = {
  envato: process.env.ENVATO_PERSONAL_TOKEN,
  razorpay: process.env.RAZORPAY_KEY_SECRET,
};

export async function getIntegrationStatus(id: IntegrationId): Promise<IntegrationStatus> {
  const d = (await ref(id).get()).data() ?? {};
  const envSecret = ENV_SECRET[id];
  const configured = !!d.secret || !!envSecret;
  return {
    configured,
    source: d.secret ? "firestore" : envSecret ? "environment" : null,
    secretHint: d.secretHint ?? (envSecret ? `…${envSecret.slice(-4)}` : null),
    publicConfig: d.publicConfig ?? {},
    configuredAt: iso(d.configuredAt),
    configuredByEmail: d.configuredByEmail ?? null,
    lastTestAt: iso(d.lastTestAt),
    lastTestOk: d.lastTestOk ?? null,
    lastTestMessage: d.lastTestMessage ?? null,
    lastError: d.lastError ?? null,
    lastErrorAt: iso(d.lastErrorAt),
    rateLimitedUntil: iso(d.rateLimitedUntil),
  };
}

/** Returns the decrypted secret (server-only). Firestore value wins over the environment. */
export async function getIntegrationSecret(id: IntegrationId): Promise<string | null> {
  const d = (await ref(id).get()).data();
  if (d?.secret) return decryptSecret(d.secret);
  return ENV_SECRET[id] ?? null;
}

export async function saveIntegration(
  id: IntegrationId,
  input: { secret?: string; publicConfig?: Record<string, string> },
  actor: { uid: string; email: string },
) {
  await ref(id).set(
    {
      ...(input.secret ? { secret: encryptSecret(input.secret), secretHint: `…${input.secret.slice(-4)}` } : {}),
      ...(input.publicConfig ? { publicConfig: input.publicConfig } : {}),
      configuredAt: FieldValue.serverTimestamp(),
      configuredBy: actor.uid,
      configuredByEmail: actor.email,
      lastTestAt: null,
      lastTestOk: null,
      lastTestMessage: null,
    },
    { merge: true },
  );
}

export async function clearIntegrationSecret(id: IntegrationId) {
  await ref(id).set({ secret: FieldValue.delete(), secretHint: FieldValue.delete(), lastTestOk: null, lastTestMessage: null }, { merge: true });
}

export async function recordTest(id: IntegrationId, ok: boolean, message: string) {
  await ref(id).set({ lastTestAt: FieldValue.serverTimestamp(), lastTestOk: ok, lastTestMessage: message }, { merge: true });
}

export async function recordError(id: IntegrationId, message: string, rateLimitedUntil?: Date) {
  await ref(id).set(
    {
      lastError: message,
      lastErrorAt: FieldValue.serverTimestamp(),
      ...(rateLimitedUntil ? { rateLimitedUntil: Timestamp.fromDate(rateLimitedUntil) } : {}),
    },
    { merge: true },
  );
}

export async function rateLimitedUntil(id: IntegrationId): Promise<Date | null> {
  const v = (await ref(id).get()).get("rateLimitedUntil");
  const d = v instanceof Timestamp ? v.toDate() : null;
  return d && d.getTime() > Date.now() ? d : null;
}
