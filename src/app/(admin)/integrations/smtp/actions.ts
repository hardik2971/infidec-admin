"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { saveTemplate, sendTemplate, setTemplateEnabled, verifySmtp } from "@/lib/email/service";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, type TemplateKey } from "@/lib/email/templates";

const key = z.enum(TEMPLATE_KEYS);

export async function verifySmtpAction(): Promise<Result> {
  try {
    await assertPermission("integrations:edit");
    await verifySmtp();
    return { ok: true, message: "SMTP connection and login succeeded." };
  } catch (error) {
    if (error instanceof Error && !("issues" in error)) return { ok: false, error: `SMTP check failed: ${error.message}` };
    return failure(error, "smtp verify");
  }
}

/** Sends a template with sample values to any address (ignores the on/off switch). */
export async function sendTestEmailAction(input: { to: string; template: TemplateKey }): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:edit");
    const v = z.object({ to: z.email("Enter a valid email address."), template: key }).parse(input);
    const sample = Object.fromEntries(DEFAULT_TEMPLATES[v.template].variables.map((n) => [n, `[${n}]`]));
    const r = await sendTemplate(v.template, v.to, { ...sample, customerName: "Sample Customer", platformName: "INFIDEC", link: "https://infidec-admin.web.app" }, { sentBy: actor.uid, force: true, related: { type: "test", id: v.template } });
    await logActivity({ action: "integration.email_test", actorId: actor.uid, actorEmail: actor.email, targetType: "integration", targetId: "smtp", summary: `Test email (${v.template}) to ${v.to}: ${r.status}` });
    refresh();
    return r.status === "sent" ? { ok: true, message: `Test email sent to ${v.to}.` } : { ok: false, error: r.error ?? "The email was not sent." };
  } catch (error) {
    return failure(error, "smtp test");
  }
}

export async function saveTemplateAction(input: { template: TemplateKey; subject: string; body: string } | { template: TemplateKey; reset: true }): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:manage_settings");
    const k = key.parse(input.template);
    if ("reset" in input) await saveTemplate(k, null, actor.uid);
    else {
      const v = z.object({ subject: z.string().trim().min(3, "Write a subject.").max(200), body: z.string().trim().min(10, "Write the email body.").max(10_000) }).parse(input);
      await saveTemplate(k, v, actor.uid);
    }
    await logActivity({ action: "integration.email_template", actorId: actor.uid, actorEmail: actor.email, targetType: "emailTemplate", targetId: k, summary: `${"reset" in input ? "Reset" : "Updated"} the "${DEFAULT_TEMPLATES[k].label}" email template` });
    refresh();
    return { ok: true, message: "reset" in input ? "Template reset to default." : "Template saved." };
  } catch (error) {
    return failure(error, "smtp template");
  }
}

export async function setTemplateEnabledAction(input: { template: TemplateKey; enabled: boolean }): Promise<Result> {
  try {
    const actor = await assertPermission("integrations:manage_settings");
    const v = z.object({ template: key, enabled: z.boolean() }).parse(input);
    await setTemplateEnabled(v.template, v.enabled, actor.uid);
    await logActivity({ action: "integration.email_toggle", actorId: actor.uid, actorEmail: actor.email, targetType: "emailTemplate", targetId: v.template, summary: `${v.enabled ? "Enabled" : "Disabled"} "${DEFAULT_TEMPLATES[v.template].label}" emails` });
    refresh();
    return { ok: true, message: `${DEFAULT_TEMPLATES[v.template].label} emails ${v.enabled ? "on" : "off"}.` };
  } catch (error) {
    return failure(error, "smtp toggle");
  }
}
