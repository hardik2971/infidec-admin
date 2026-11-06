import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { formatDateTime, formatMoney } from "@/lib/format";
import { LICENSE_TYPE_LABELS, type LicenseType } from "@/lib/sales/schema";
import { sendTemplate, type SendResult } from "./service";

const get = (c: keyof typeof COLLECTIONS, id: string) => adminDb.collection(COLLECTIONS[c]).doc(id).get();
const day = (v: unknown) => (v instanceof Timestamp ? formatDateTime(v.toDate()).split(",")[0] : "—");

async function customerOf(id: string) {
  const c = await get("customers", id);
  return c.exists && c.get("status") === "active" ? { name: String(c.get("name")), email: String(c.get("email")) } : null;
}

async function productName(id: string) {
  return String((await get("products", id)).get("name") ?? "your product");
}

/** Direct order completed → purchase confirmation with the INFIDEC license. */
export async function notifyPurchase(orderId: string, sentBy?: string): Promise<SendResult> {
  const order = await get("orders", orderId);
  const licenseId = order.get("licenseId");
  if (!order.exists || !licenseId) return { status: "skipped" };
  const [customer, license, product] = await Promise.all([customerOf(order.get("customerId")), get("licenses", licenseId), productName(order.get("productId"))]);
  if (!customer) return { status: "skipped" };
  return sendTemplate(
    "purchase_confirmation",
    customer.email,
    {
      customerName: customer.name,
      productName: product,
      orderNumber: String(order.get("orderNumber")),
      licenseType: LICENSE_TYPE_LABELS[license.get("licenseType") as LicenseType] ?? "",
      licenseKey: String(license.get("licenseKey")),
      supportUntil: day(license.get("supportExpiry")),
    },
    { related: { type: "order", id: orderId }, sentBy },
  );
}

/** Envato purchase code verified and recorded. */
export async function notifyLicenseVerified(licenseId: string, sentBy?: string): Promise<SendResult> {
  const license = await get("licenses", licenseId);
  const customer = license.exists ? await customerOf(license.get("customerId")) : null;
  if (!customer) return { status: "skipped" };
  return sendTemplate(
    "license_verified",
    customer.email,
    {
      customerName: customer.name,
      productName: await productName(license.get("productId")),
      licenseType: LICENSE_TYPE_LABELS[license.get("licenseType") as LicenseType] ?? "",
      licenseKey: String(license.get("licenseKey")),
      supportUntil: day(license.get("supportExpiry")),
    },
    { related: { type: "license", id: licenseId }, sentBy },
  );
}

export async function notifyCustomerRegistration(customerId: string, sentBy?: string) {
  const customer = await customerOf(customerId);
  if (!customer) return { status: "skipped" } as SendResult;
  return sendTemplate("customer_registration", customer.email, { customerName: customer.name, platformName: "INFIDEC" }, { related: { type: "customer", id: customerId }, sentBy });
}

export async function notifyTicketCreated(ticketId: string, sentBy?: string): Promise<SendResult> {
  const t = await get("supportTickets", ticketId);
  const customer = t.exists ? await customerOf(t.get("customerId")) : null;
  if (!customer) return { status: "skipped" };
  return sendTemplate(
    "ticket_created",
    customer.email,
    { customerName: customer.name, ticketNumber: String(t.get("number")), subject: String(t.get("subject")), productName: await productName(t.get("productId")) },
    { related: { type: "ticket", id: ticketId }, sentBy },
  );
}

/** Public staff reply → email the customer and record the delivery status on the message. */
export async function notifyTicketReply(ticketId: string, messageId: string, body: string, staffName: string, sentBy?: string): Promise<SendResult> {
  const t = await get("supportTickets", ticketId);
  const customer = t.exists ? await customerOf(t.get("customerId")) : null;
  const result: SendResult = customer
    ? await sendTemplate(
        "ticket_reply",
        customer.email,
        { customerName: customer.name, ticketNumber: String(t.get("number")), subject: String(t.get("subject")), message: body, staffName },
        { related: { type: "ticket", id: ticketId }, sentBy },
      )
    : { status: "skipped" };
  await t.ref.collection("messages").doc(messageId).update({ emailStatus: result.status, emailError: result.error ?? null });
  return result;
}

export async function notifyRefund(refundId: string, sentBy?: string): Promise<SendResult> {
  const r = await get("refunds", refundId);
  const customer = r.exists ? await customerOf(r.get("customerId")) : null;
  if (!customer) return { status: "skipped" };
  const history = (r.get("history") ?? []) as { note?: string }[];
  const labels: Record<string, string> = { approved: "approved", rejected: "rejected", completed: "completed" };
  return sendTemplate(
    "refund_status",
    customer.email,
    {
      customerName: customer.name,
      refundNumber: String(r.get("number")),
      orderNumber: String(r.get("orderNumber")),
      status: labels[r.get("status")] ?? String(r.get("status")),
      amount: formatMoney(Number(r.get("amount") ?? 0), String(r.get("currency") ?? "USD")),
      note: history.at(-1)?.note ?? "",
    },
    { related: { type: "refund", id: refundId }, sentBy },
  );
}

export async function notifyDownload(
  customerId: string,
  pkg: { productId: string; version: string; fileName: string },
  link: string,
  expiresInMinutes: number,
  sentBy?: string,
): Promise<SendResult> {
  const customer = await customerOf(customerId);
  if (!customer) return { status: "skipped", error: "Customer not found or suspended." };
  return sendTemplate(
    "download_available",
    customer.email,
    { customerName: customer.name, productName: await productName(pkg.productId), version: `v${pkg.version}`, fileName: pkg.fileName, link, expiresInMinutes: String(expiresInMinutes) },
    { related: { type: "customer", id: customerId }, sentBy, force: true },
  );
}

/**
 * Emails every customer with an active license for the version's product. The first
 * published version uses the "new product release" template, later ones "product update".
 */
export async function notifyVersion(versionId: string, sentBy: string) {
  const v = await get("productVersions", versionId);
  if (!v.exists || v.get("status") !== "published") throw new Error("Only published versions can be announced.");
  const productId = String(v.get("productId"));
  const [licenses, published, product] = await Promise.all([
    adminDb.collection(COLLECTIONS.licenses).where("productId", "==", productId).where("status", "==", "active").get(),
    adminDb.collection(COLLECTIONS.productVersions).where("productId", "==", productId).where("status", "in", ["published", "deprecated"]).count().get(),
    productName(productId),
  ]);
  const template = published.data().count <= 1 ? "new_product_release" : "product_update";
  const notes = [String(v.get("releaseNotes") ?? ""), ...((v.get("newFeatures") ?? []) as string[]).map((f) => `• ${f}`)].filter(Boolean).join("\n");
  const customerIds = [...new Set(licenses.docs.map((l) => String(l.get("customerId"))))];
  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const id of customerIds) {
    const customer = await customerOf(id);
    if (!customer) {
      counts.skipped++;
      continue;
    }
    const r = await sendTemplate(template, customer.email, { customerName: customer.name, productName: product, version: `v${v.get("version")}`, releaseNotes: notes }, { related: { type: "version", id: versionId }, sentBy });
    counts[r.status]++;
  }
  await v.ref.update({ notifiedAt: Timestamp.now(), notifiedCounts: counts });
  return { ...counts, recipients: customerIds.length, template };
}
