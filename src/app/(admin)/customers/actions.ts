"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { CUSTOMER_STATUSES, ORDER_STATUSES, ORDER_STATUS_LABELS, customerSchema, orderSchema, type OrderStatus } from "@/lib/sales/schema";
import { notifyCustomerRegistration, notifyPurchase } from "@/lib/email/notify";
import { addCustomerNote, createOrder, saveCustomer, setCustomerStatus, setLicenseStatus, setOrderStatus } from "@/lib/sales/service";

export async function saveCustomerAction(input: { id?: string; values: unknown }): Promise<Result<{ id: string }>> {
  try {
    const id = input.id ? docId.parse(input.id) : undefined;
    const actor = await assertPermission(id ? "customers:edit" : "customers:create");
    const values = customerSchema.parse(input.values);
    const savedId = await saveCustomer(values, actor.uid, id);
    if (!id) await notifyCustomerRegistration(savedId, actor.uid);
    await logActivity({ action: id ? "customer.updated" : "customer.created", actorId: actor.uid, actorEmail: actor.email, targetType: "customer", targetId: savedId, summary: `${id ? "Updated" : "Created"} customer ${values.email}` });
    refresh();
    return { ok: true, id: savedId, message: id ? "Customer updated." : "Customer created." };
  } catch (error) {
    return failure(error, "customer save");
  }
}

export async function setCustomerStatusAction(input: { id: string; status: string }): Promise<Result> {
  try {
    const actor = await assertPermission("customers:edit");
    const v = z.object({ id: docId, status: z.enum(CUSTOMER_STATUSES) }).parse(input);
    await setCustomerStatus(v.id, v.status, actor.uid);
    await logActivity({ action: "customer.status_changed", actorId: actor.uid, actorEmail: actor.email, targetType: "customer", targetId: v.id, summary: `Customer account ${v.status}` });
    refresh();
    return { ok: true, message: v.status === "suspended" ? "Account suspended." : "Account reactivated." };
  } catch (error) {
    return failure(error, "customer status");
  }
}

export async function addCustomerNoteAction(input: { id: string; body: string }): Promise<Result> {
  try {
    const actor = await assertPermission("customers:edit");
    const v = z.object({ id: docId, body: z.string().trim().min(1, "Write a note.").max(5000) }).parse(input);
    await addCustomerNote(v.id, v.body, actor);
    refresh();
    return { ok: true, message: "Note added." };
  } catch (error) {
    return failure(error, "customer note");
  }
}

export async function createOrderAction(values: unknown): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPermission("orders:create");
    const data = orderSchema.parse(values);
    const { id, licenseId } = await createOrder(data, actor.uid);
    const email = licenseId ? await notifyPurchase(id, actor.uid) : null;
    await logActivity({
      action: "order.created",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "order",
      targetId: id,
      productId: data.productId,
      summary: `Recorded ${data.channel} order (${data.status})${licenseId ? " and issued a license" : ""}`,
    });
    refresh();
    return { ok: true, id, message: licenseId ? `Order recorded and license issued${email?.status === "sent" ? " — confirmation emailed" : ""}.` : "Order recorded." };
  } catch (error) {
    return failure(error, "order create");
  }
}

export async function setOrderStatusAction(input: { id: string; status: OrderStatus }): Promise<Result> {
  try {
    const actor = await assertPermission("orders:edit");
    const v = z.object({ id: docId, status: z.enum(ORDER_STATUSES) }).parse(input);
    const r = await setOrderStatus(v.id, v.status, actor.uid);
    if (r.licenseIssued) await notifyPurchase(v.id, actor.uid);
    await logActivity({
      action: "order.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "order",
      targetId: v.id,
      productId: r.productId,
      summary: `${r.orderNumber}: ${ORDER_STATUS_LABELS[r.previous]} → ${ORDER_STATUS_LABELS[v.status]}`,
    });
    refresh();
    return { ok: true, message: `Order marked ${ORDER_STATUS_LABELS[v.status].toLowerCase()}.` };
  } catch (error) {
    return failure(error, "order status");
  }
}

export async function setLicenseStatusAction(input: { id: string; status: "active" | "revoked" }): Promise<Result> {
  try {
    const actor = await assertPermission("licenses:edit");
    const v = z.object({ id: docId, status: z.enum(["active", "revoked"]) }).parse(input);
    const l = await setLicenseStatus(v.id, v.status, actor.uid);
    await logActivity({
      action: "license.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "license",
      targetId: v.id,
      productId: l.productId,
      summary: `License ${l.licenseKey} ${v.status === "revoked" ? "revoked" : "reactivated"}`,
    });
    refresh();
    return { ok: true, message: v.status === "revoked" ? "License revoked." : "License reactivated." };
  } catch (error) {
    return failure(error, "license status");
  }
}
