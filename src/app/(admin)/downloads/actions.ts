"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { issueDownload } from "@/lib/downloads/service";
import { clientIp } from "@/lib/rate-limit";

/** Staff issue an entitlement-checked, short-lived link on a customer's behalf (e.g. for a support reply). */
export async function issueCustomerDownloadAction(input: { customerId: string; packageId: string }): Promise<{ ok: true; url: string; expiresInMinutes: number } | { ok: false; error: string }> {
  try {
    const actor = await assertPermission("downloads:download");
    const v = z.object({ customerId: docId, packageId: docId }).parse(input);
    const h = await headers();
    const r = await issueDownload({ ...v, issuedBy: { type: "staff", uid: actor.uid, email: actor.email }, ip: clientIp(h), userAgent: h.get("user-agent") });
    await logActivity({
      action: "download.issued",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "customer",
      targetId: v.customerId,
      productId: r.pkg.productId,
      summary: `Issued a ${r.expiresInMinutes}-minute download link for "${r.pkg.fileName}" (v${r.pkg.version})`,
    });
    return { ok: true, url: r.url, expiresInMinutes: r.expiresInMinutes };
  } catch (error) {
    return failure(error, "issue download");
  }
}
