import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import nodemailer, { type Transporter } from "nodemailer";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, renderEmail, type TemplateKey } from "./templates";

/**
 * Outgoing email via SMTP (MAIL_* environment variables; the password is a secret).
 * Every attempt is logged in `notifications`. Sending never throws into the caller's
 * operation — a failed email must not undo a refund or a ticket reply.
 */
export function smtpConfig() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS, MAIL_FROM_NAME } = process.env;
  return {
    configured: !!(MAIL_HOST && MAIL_PORT && MAIL_USERNAME && MAIL_PASSWORD && MAIL_FROM_ADDRESS),
    host: MAIL_HOST ?? "",
    port: Number(MAIL_PORT ?? 587),
    username: MAIL_USERNAME ?? "",
    fromAddress: MAIL_FROM_ADDRESS ?? "",
    fromName: MAIL_FROM_NAME ?? "INFIDEC",
    passwordSet: !!MAIL_PASSWORD,
  };
}

let transporter: Transporter | null = null;
function transport() {
  if (transporter) return transporter;
  const c = smtpConfig();
  if (!c.configured) throw new Error("SMTP is not configured.");
  transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    requireTLS: c.port !== 465,
    auth: { user: c.username, pass: process.env.MAIL_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  return transporter;
}

export async function verifySmtp() {
  await transport().verify();
}

const settingsRef = () => adminDb.collection(COLLECTIONS.systemSettings).doc("email");

export interface EmailSettings {
  templates: Record<TemplateKey, { subject: string; body: string; customised: boolean }>;
  enabled: Record<TemplateKey, boolean>;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const d = (await settingsRef().get()).data() ?? {};
  const templates = {} as EmailSettings["templates"];
  const enabled = {} as EmailSettings["enabled"];
  for (const k of TEMPLATE_KEYS) {
    const o = d.templates?.[k];
    templates[k] = o?.subject && o?.body ? { subject: o.subject, body: o.body, customised: true } : { subject: DEFAULT_TEMPLATES[k].subject, body: DEFAULT_TEMPLATES[k].body, customised: false };
    enabled[k] = typeof d.enabled?.[k] === "boolean" ? d.enabled[k] : DEFAULT_TEMPLATES[k].defaultEnabled;
  }
  return { templates, enabled };
}

export async function saveTemplate(key: TemplateKey, value: { subject: string; body: string } | null, actorId: string) {
  await settingsRef().set(
    { templates: { [key]: value ?? FieldValue.delete() }, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function setTemplateEnabled(key: TemplateKey, enabled: boolean, actorId: string) {
  await settingsRef().set({ enabled: { [key]: enabled }, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function brand() {
  const g = await adminDb.collection(COLLECTIONS.systemSettings).doc("general").get();
  const replyTo = String(g.get("supportEmail") ?? "");
  return { name: String(g.get("platformName") ?? "INFIDEC"), replyTo: replyTo.includes("@") ? replyTo : undefined };
}

export interface SendResult {
  status: "sent" | "failed" | "skipped";
  error?: string;
}

/**
 * Renders and sends a template. `force` ignores the on/off switch (used for test sends
 * and explicit staff actions such as "email this link").
 */
export async function sendTemplate(
  key: TemplateKey,
  to: string,
  data: Record<string, string>,
  opts: { related?: { type: string; id: string }; sentBy?: string; force?: boolean } = {},
): Promise<SendResult> {
  const log = adminDb.collection(COLLECTIONS.notifications).doc();
  const base = { channel: "email", template: key, to, related: opts.related ?? null, sentBy: opts.sentBy ?? null, createdAt: FieldValue.serverTimestamp() };
  try {
    const settings = await getEmailSettings();
    if (!opts.force && !settings.enabled[key]) {
      await log.set({ ...base, status: "skipped", error: "Template switched off" });
      return { status: "skipped" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Invalid recipient address.");
    const c = smtpConfig();
    if (!c.configured) throw new Error("SMTP is not configured.");
    const b = await brand();
    const { subject, text, html } = renderEmail(settings.templates[key], data, b.name);
    const info = await transport().sendMail({ from: { name: c.fromName, address: c.fromAddress }, replyTo: b.replyTo, to, subject, text, html });
    await log.set({ ...base, subject, status: "sent", messageId: info.messageId ?? null });
    return { status: "sent" };
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    console.error("[email]", key, message);
    await log.set({ ...base, status: "failed", error: message }).catch(() => {});
    return { status: "failed", error: message };
  }
}

export interface EmailLog {
  id: string;
  template: string;
  to: string;
  subject: string | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  createdAt: string | null;
}

export async function listEmailLogs(limit = 300): Promise<EmailLog[]> {
  const snap = await adminDb.collection(COLLECTIONS.notifications).where("channel", "==", "email").limit(2000).get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      template: String(d.get("template")),
      to: String(d.get("to") ?? ""),
      subject: d.get("subject") ?? null,
      status: d.get("status"),
      error: d.get("error") ?? null,
      createdAt: d.get("createdAt") instanceof Timestamp ? d.get("createdAt").toDate().toISOString() : null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);
}
