"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { lookupSale } from "@/lib/integrations/envato";
import { verifyPurchaseCode, type VerificationOutcome } from "@/lib/licenses/verification";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordVerifiedSale } from "@/lib/sales/service";
import { headers } from "next/headers";

export async function verifyCodeAction(code: string): Promise<{ ok: true; outcome: VerificationOutcome } | { ok: false; error: string }> {
  try {
    const actor = await assertPermission("licenses:view");
    const limit = rateLimit(`verify:${actor.uid}:${clientIp(await headers())}`, 30, 60_000);
    if (!limit.ok) return { ok: false, error: `Too many verifications. Wait ${limit.retryAfterSec}s.` };
    const outcome = await verifyPurchaseCode(z.string().max(100).parse(code), actor);
    await logActivity({
      action: "license.verification",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "purchaseCode",
      summary: `Verified purchase code …${code.trim().slice(-4)}: ${outcome.status}`,
      productId: outcome.status === "valid" ? (outcome.product?.id ?? undefined) : outcome.status === "already_recorded" ? outcome.license.productId : undefined,
    });
    return { ok: true, outcome };
  } catch (error) {
    return failure(error, "verify code");
  }
}

const recordInput = z.object({
  code: z.string().trim().max(100),
  productId: docId,
  customerId: docId.optional(),
  customerName: z.string().trim().max(120),
  customerEmail: z.string().trim().max(200),
  authorEarnings: z.number().min(0).max(1_000_000).nullable(),
});

/** Re-verifies the code server-side (never trusts the browser's copy of the sale) and records it. */
export async function recordSaleAction(input: z.input<typeof recordInput>): Promise<Result<{ customerId: string; licenseId: string }>> {
  try {
    const actor = await assertPermission("licenses:create");
    await assertPermission("orders:create");
    const v = recordInput.parse(input);
    if (!v.customerId && v.customerEmail && !z.email().safeParse(v.customerEmail).success) return { ok: false, error: "Enter a valid email address." };
    const sale = await lookupSale(v.code);
    if (!sale) return { ok: false, error: "Envato no longer recognises this purchase code." };

    const r = await recordVerifiedSale(
      {
        code: v.code.toLowerCase(),
        productId: v.productId,
        buyer: sale.buyer,
        licenseType: sale.licenseType,
        soldAt: sale.soldAt,
        supportedUntil: sale.supportedUntil,
        reportedAmount: sale.amount,
        authorEarnings: v.authorEarnings,
        customer: { id: v.customerId, name: v.customerName, email: v.customerEmail },
      },
      actor.uid,
    );
    await logActivity({
      action: "license.created",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "license",
      targetId: r.licenseId,
      productId: v.productId,
      summary: `Recorded verified Envato sale (code …${v.code.slice(-4)}, buyer ${sale.buyer}, ${sale.license})`,
    });
    refresh();
    return { ok: true, customerId: r.customerId, licenseId: r.licenseId, message: "Sale recorded: customer, order and license created." };
  } catch (error) {
    return failure(error, "record sale");
  }
}
