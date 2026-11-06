/** Email templates (spec §22) — shared by the editor UI and the sender. */

export const TEMPLATE_KEYS = [
  "customer_registration",
  "purchase_confirmation",
  "license_verified",
  "new_product_release",
  "product_update",
  "ticket_created",
  "ticket_reply",
  "refund_status",
  "download_available",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateDef {
  label: string;
  description: string;
  /** Placeholders available in subject and body, e.g. {{customerName}}. */
  variables: string[];
  subject: string;
  body: string;
  /** Sent automatically unless switched off. */
  defaultEnabled: boolean;
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, TemplateDef> = {
  customer_registration: {
    label: "Customer registration",
    description: "When staff create a customer account.",
    variables: ["customerName", "platformName"],
    subject: "Welcome to {{platformName}}",
    body: "Hi {{customerName}},\n\nYour customer account has been created. You can reach our team any time by replying to this email.\n\nThanks,\nThe INFIDEC team",
    defaultEnabled: false,
  },
  purchase_confirmation: {
    label: "Purchase confirmation",
    description: "When a direct website order is completed and a license is issued.",
    variables: ["customerName", "productName", "orderNumber", "licenseType", "licenseKey", "supportUntil"],
    subject: "Your {{productName}} purchase — order {{orderNumber}}",
    body: "Hi {{customerName}},\n\nThank you for purchasing {{productName}}.\n\nOrder: {{orderNumber}}\nLicense: {{licenseType}}\nLicense key: {{licenseKey}}\nSupport until: {{supportUntil}}\n\nKeep this email — the license key identifies your purchase for downloads and support.\n\nThe INFIDEC team",
    defaultEnabled: true,
  },
  license_verified: {
    label: "License verification",
    description: "When a CodeCanyon purchase code is verified and recorded.",
    variables: ["customerName", "productName", "licenseType", "licenseKey", "supportUntil"],
    subject: "Your {{productName}} license is verified",
    body: "Hi {{customerName}},\n\nWe've verified your purchase of {{productName}} with Envato.\n\nLicense: {{licenseType}}\nLicense key: {{licenseKey}}\nSupport until: {{supportUntil}}\n\nThe INFIDEC team",
    defaultEnabled: true,
  },
  new_product_release: {
    label: "New product release",
    description: "When the first version of a product is published and staff notify customers.",
    variables: ["customerName", "productName", "version", "releaseNotes"],
    subject: "{{productName}} {{version}} is available",
    body: "Hi {{customerName}},\n\n{{productName}} {{version}} has been released.\n\n{{releaseNotes}}\n\nThe INFIDEC team",
    defaultEnabled: true,
  },
  product_update: {
    label: "Product update",
    description: "When staff notify license holders about a new version.",
    variables: ["customerName", "productName", "version", "releaseNotes"],
    subject: "Update available: {{productName}} {{version}}",
    body: "Hi {{customerName}},\n\nA new version of {{productName}} is available: {{version}}.\n\n{{releaseNotes}}\n\nThe update is included with your license.\n\nThe INFIDEC team",
    defaultEnabled: true,
  },
  ticket_created: {
    label: "New support ticket",
    description: "Acknowledges a ticket opened for the customer.",
    variables: ["customerName", "ticketNumber", "subject", "productName"],
    subject: "[{{ticketNumber}}] We received your request: {{subject}}",
    body: "Hi {{customerName}},\n\nWe've opened ticket {{ticketNumber}} for your {{productName}} request \"{{subject}}\". Our team will reply here.\n\nThe INFIDEC support team",
    defaultEnabled: true,
  },
  ticket_reply: {
    label: "Customer reply",
    description: "When staff reply on a support ticket (internal notes are never emailed).",
    variables: ["customerName", "ticketNumber", "subject", "message", "staffName"],
    subject: "Re: [{{ticketNumber}}] {{subject}}",
    body: "Hi {{customerName}},\n\n{{message}}\n\n— {{staffName}}, INFIDEC support",
    defaultEnabled: true,
  },
  refund_status: {
    label: "Refund status",
    description: "When a refund request is approved, rejected or completed.",
    variables: ["customerName", "refundNumber", "orderNumber", "status", "amount", "note"],
    subject: "Refund {{refundNumber}}: {{status}}",
    body: "Hi {{customerName}},\n\nYour refund request {{refundNumber}} for order {{orderNumber}} ({{amount}}) is now {{status}}.\n\n{{note}}\n\nThe INFIDEC team",
    defaultEnabled: true,
  },
  download_available: {
    label: "Download availability",
    description: "When staff email a download link to a customer.",
    variables: ["customerName", "productName", "version", "fileName", "link", "expiresInMinutes"],
    subject: "Your {{productName}} {{version}} download",
    body: "Hi {{customerName}},\n\nYour download of {{fileName}} ({{productName}} {{version}}) is ready:\n\n{{link}}\n\nThis secure link expires in {{expiresInMinutes}} minutes.\n\nThe INFIDEC team",
    defaultEnabled: true,
  },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fill(text: string, data: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => data[k] ?? "");
}

/** Renders a template to subject / text / branded HTML. Values are HTML-escaped. */
export function renderEmail(t: { subject: string; body: string }, data: Record<string, string>, platformName = "INFIDEC") {
  const subject = fill(t.subject, data).replace(/[\r\n]+/g, " ").slice(0, 200);
  const text = fill(t.body, data);
  const htmlBody = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2155eb">$1</a>')}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2033">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e8f0">
<tr><td style="height:4px;background:linear-gradient(90deg,#22c4f0,#2155eb,#8b2cf5)"></td></tr>
<tr><td style="padding:28px 32px 4px;font-size:13px;font-weight:700;letter-spacing:.14em;color:#2155eb">${escapeHtml(platformName.toUpperCase())}</td></tr>
<tr><td style="padding:16px 32px 20px;font-size:15px;line-height:1.6">${htmlBody}</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#7a8098;border-top:1px solid #eef0f5">You're receiving this because you purchased or contacted INFIDEC.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
