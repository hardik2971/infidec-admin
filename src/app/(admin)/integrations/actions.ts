"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { DomainError, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { encryptionConfigured } from "@/lib/crypto";
import { getItem, getTokenOwner, type EnvatoItem } from "@/lib/integrations/envato";
import { testWebsiteConnection } from "@/lib/website/source";
import { clearIntegrationSecret, getIntegrationSecret, getIntegrationStatus, recordTest, saveIntegration, type IntegrationId } from "@/lib/integrations/settings";

function requireEncryption() {
  if (!encryptionConfigured()) throw new DomainError("Set INTEGRATION_ENCRYPTION_KEY on the server before saving credentials.");
}

export async function saveEnvatoTokenAction(token: string): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:manage_settings");
    requireEncryption();
    const t = z.string().trim().min(20, "That token looks too short.").max(200).parse(token);
    await saveIntegration("envato", { secret: t }, actor);
    await logActivity({ action: "integration.updated", actorId: actor.uid, actorEmail: actor.email, targetType: "integration", targetId: "envato", summary: "Saved a new Envato API token" });
    refresh();
    return { ok: true, message: "Token saved (encrypted). Run a connection test." };
  } catch (error) {
    return failure(error, "envato token");
  }
}

export async function testIntegrationAction(id: IntegrationId): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:edit");
    let message: string;
    let ok = true;
    if (id === "envato") {
      try {
        message = `Connected as ${await getTokenOwner()}.`;
      } catch (error) {
        ok = false;
        message = (error as Error).message;
      }
    } else if (id === "website") {
      try {
        const r = await testWebsiteConnection();
        message = `Read access to ${r.projectId} OK — ${r.users} customer account(s), ${r.orders} order(s).`;
      } catch (error) {
        ok = false;
        message = (error as Error).message;
      }
    } else {
      const secret = await getIntegrationSecret("razorpay");
      const keyId = (await getIntegrationStatus("razorpay")).publicConfig.keyId ?? process.env.RAZORPAY_KEY_ID;
      if (!secret || !keyId) {
        ok = false;
        message = "Key ID and key secret are both required.";
      } else {
        const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
          headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}` },
          signal: AbortSignal.timeout(15_000),
        }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as Response);
        ok = res.ok;
        message = res.ok ? `Razorpay accepted the ${keyId.startsWith("rzp_live") ? "live" : "test"} keys.` : res.status === 401 ? "Razorpay rejected the keys." : `Razorpay error (HTTP ${res.status}).`;
      }
    }
    await recordTest(id, ok, message);
    await logActivity({ action: "integration.tested", actorId: actor.uid, actorEmail: actor.email, targetType: "integration", targetId: id, summary: `${id} connection test: ${ok ? "OK" : "failed"}` });
    refresh();
    return ok ? { ok: true, message } : { ok: false, error: message };
  } catch (error) {
    return failure(error, "integration test");
  }
}

export async function removeIntegrationSecretAction(id: IntegrationId): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:manage_settings");
    await clearIntegrationSecret(id);
    await logActivity({ action: "integration.updated", actorId: actor.uid, actorEmail: actor.email, targetType: "integration", targetId: id, summary: `Removed the stored ${id} secret` });
    refresh();
    return { ok: true, message: "Credentials removed." };
  } catch (error) {
    return failure(error, "integration remove");
  }
}

export async function fetchEnvatoItemAction(itemId: string): Promise<{ ok: true; item: EnvatoItem | null } | { ok: false; error: string }> {
  try {
    await assertPermission("integrations:view");
    return { ok: true, item: await getItem(itemId) };
  } catch (error) {
    return failure(error, "envato item");
  }
}

const razorpaySchema = z.object({
  keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]{6,}$/, "Razorpay key IDs start with rzp_test_ or rzp_live_."),
  keySecret: z.string().trim().max(200),
});

export async function saveRazorpayAction(input: z.input<typeof razorpaySchema>): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:manage_settings");
    requireEncryption();
    const v = razorpaySchema.parse(input);
    await saveIntegration("razorpay", { secret: v.keySecret || undefined, publicConfig: { keyId: v.keyId, mode: v.keyId.startsWith("rzp_live") ? "live" : "test" } }, actor);
    await logActivity({ action: "integration.updated", actorId: actor.uid, actorEmail: actor.email, targetType: "integration", targetId: "razorpay", summary: `Saved Razorpay ${v.keyId.startsWith("rzp_live") ? "live" : "test"} credentials` });
    refresh();
    return { ok: true, message: "Razorpay credentials saved (secret encrypted)." };
  } catch (error) {
    return failure(error, "razorpay save");
  }
}
