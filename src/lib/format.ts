/** Formats an amount stored in minor units (cents). */
export function formatMoney(minor: number, currency = "USD", opts: { compact?: boolean } = {}) {
  // INR uses Indian digit grouping (₹1,09,990), matching infidec.com.
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 2,
  }).format(minor / 100);
}

export function formatNumber(n: number, opts: { compact?: boolean } = {}) {
  return new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Business time zone for every displayed date. Fixed (not the machine's zone) so the server
 * (UTC in production) and the browser render identical text — otherwise React hydration fails.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Asia/Kolkata";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: APP_TIME_ZONE });

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return dateTimeFormat.format(d);
}
