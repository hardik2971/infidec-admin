"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { DomainError, docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { encryptionConfigured } from "@/lib/crypto";
import { formatMoney } from "@/lib/format";
import { saveIntegration } from "@/lib/integrations/settings";
import { applyWebsitePrices, checkCatalogDrift, type CatalogDrift } from "@/lib/website/catalog";
import { firestoreWebsiteReader } from "@/lib/website/source";
import { recordSync, runWebsiteSync, type SyncStats } from "@/lib/website/sync";

const keySchema = z.object({
  type: z.literal("service_account", { error: "This is not a service-account key." }),
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY", { error: "The key file has no private key." }),
  private_key_id: z.string().optional(),
});

export async function replaceWebsiteKeyAction(input: { json: string; baseUrl: string }): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:manage_settings");
    if (!encryptionConfigured()) throw new DomainError("Set INTEGRATION_ENCRYPTION_KEY on the server before saving credentials.");
    const baseUrl = z.url({ protocol: /^https$/, error: "Enter the website's https address." }).parse(input.baseUrl.trim());
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.json);
    } catch {
      throw new DomainError("Paste the full JSON key file.");
    }
    const key = keySchema.parse(parsed);
    await saveIntegration(
      "website",
      { secret: input.json.trim(), publicConfig: { projectId: key.project_id, clientEmail: key.client_email, baseUrl: new URL(baseUrl).origin } },
      actor,
    );
    await logActivity({ action: "integration.updated", actorId: actor.uid, actorEmail: actor.email, targetType: "integration", targetId: "website", summary: `Saved a website read key for ${key.project_id}` });
    refresh();
    return { ok: true, message: "Key saved (encrypted). Run a connection test." };
  } catch (error) {
    return failure(error, "website key");
  }
}

export async function syncWebsiteAction(input: { dryRun: boolean }): Promise<Result<{ stats: SyncStats }>> {
  try {
    const actor = await assertPermission("integrations:edit");
    const dryRun = z.boolean().parse(input.dryRun);
    const reader = await firestoreWebsiteReader();
    const stats = await runWebsiteSync(reader, { actorId: actor.uid, dryRun });
    if (!dryRun) {
      await recordSync(stats, actor);
      await logActivity({
        action: "integration.website_sync",
        actorId: actor.uid,
        actorEmail: actor.email,
        targetType: "integration",
        targetId: "website",
        summary: `Website sync: ${stats.customersCreated} new customer(s), ${stats.ordersCreated} new order(s), ${stats.ordersUpdated} updated, ${stats.itemsSkipped} skipped`,
        metadata: { ...stats },
      });
      refresh();
    }
    const verb = dryRun ? "would import" : "imported";
    return {
      ok: true,
      stats,
      message: `Website ${verb} ${stats.customersCreated} customer(s) and ${stats.ordersCreated} order(s)${stats.ordersUpdated ? `, ${stats.ordersUpdated} status update(s)` : ""}.`,
    };
  } catch (error) {
    return failure(error, "website sync");
  }
}

export async function checkCatalogAction(): Promise<Result<{ rows: CatalogDrift[] }>> {
  try {
    await assertPermission("integrations:view");
    const rows = await checkCatalogDrift();
    const drift = rows.filter((r) => !r.ok).length;
    return { ok: true, rows, message: drift ? `${drift} product(s) need attention.` : "All prices match the website." };
  } catch (error) {
    return failure(error, "website catalog");
  }
}

export async function applyWebsitePricesAction(productId: string): Promise<Result> {
  try {
    const actor = await assertPermission("products:edit");
    const r = await applyWebsitePrices(docId.parse(productId), actor.uid);
    await logActivity({
      action: "product.prices_synced",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: productId,
      productId,
      summary: `Copied website prices: regular ${formatMoney(r.before.regular, r.before.currency)} → ${formatMoney(r.after.regular, r.after.currency)}`,
      metadata: { before: r.before, after: r.after },
    });
    refresh();
    return { ok: true, message: `${r.name} now matches the website.` };
  } catch (error) {
    return failure(error, "website prices");
  }
}
