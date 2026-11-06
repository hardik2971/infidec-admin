import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { getIntegrationSecret } from "@/lib/integrations/settings";

/**
 * Read-only access to the INFIDEC website's Firestore (project "marketplace-infidec").
 * The admin never writes to the website project; this module only exposes `get()` reads.
 * Customer password hashes are never fetched — reads use an explicit field list.
 */

export interface WebsiteUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  country: string;
  createdAt: string | null;
}

export interface WebsiteOrderItem {
  slug: string;
  name: string;
  license: "regular" | "extended";
  plan: string;
  planName: string;
  licensePrice: number; // major units, as stored by the website
  planPrice: number;
  total: number;
}

export interface WebsiteOrder {
  id: string;
  userId: string;
  items: WebsiteOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  paymentMethod: string;
  status: string;
  billing: { fullName: string; email: string; phone: string; company: string; country: string };
  createdAt: string | null;
}

export interface WebsiteReader {
  users(): Promise<WebsiteUser[]>;
  orders(): Promise<WebsiteOrder[]>;
}

const USER_FIELDS = ["firstName", "lastName", "email", "countryCode", "phone", "company", "country", "createdAt"] as const;
const ORDER_FIELDS = ["userId", "items", "subtotal", "tax", "total", "currency", "paymentMethod", "status", "billing", "createdAt"] as const;
const MAX_DOCS = 10_000;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
function isoDate(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
}

export function toWebsiteUser(id: string, d: Record<string, unknown>): WebsiteUser {
  return {
    id,
    firstName: str(d.firstName),
    lastName: str(d.lastName),
    email: str(d.email).toLowerCase(),
    phone: [str(d.countryCode), str(d.phone)].filter(Boolean).join(" "),
    company: str(d.company),
    country: str(d.country),
    createdAt: isoDate(d.createdAt),
  };
}

export function toWebsiteOrder(id: string, d: Record<string, unknown>): WebsiteOrder {
  const b = (d.billing ?? {}) as Record<string, unknown>;
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  return {
    id,
    userId: str(d.userId),
    items: items.map((i) => ({
      slug: str(i.slug),
      name: str(i.name),
      license: i.license === "extended" ? "extended" : "regular",
      plan: str(i.plan),
      planName: str(i.planName),
      licensePrice: num(i.licensePrice),
      planPrice: num(i.planPrice),
      total: num(i.total),
    })),
    subtotal: num(d.subtotal),
    tax: num(d.tax),
    total: num(d.total),
    currency: str(d.currency).toUpperCase() || "INR",
    paymentMethod: str(d.paymentMethod),
    status: str(d.status) || "pending",
    billing: { fullName: str(b.fullName), email: str(b.email).toLowerCase(), phone: str(b.phone), company: str(b.company), country: str(b.country) },
    createdAt: isoDate(d.createdAt),
  };
}

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

async function websiteDb() {
  const raw = await getIntegrationSecret("website");
  if (!raw) throw new DomainError("Add the website's service-account key first.");
  let key: ServiceAccountJson;
  try {
    key = JSON.parse(raw);
  } catch {
    throw new DomainError("The stored website key is not valid JSON. Replace it.");
  }
  // App name includes the key id so a replaced key gets a fresh client.
  const name = `website-ro-${(key.private_key_id ?? key.client_email).slice(0, 12)}`;
  const app =
    getApps().find((a) => a.name === name) ??
    initializeApp({ credential: cert({ projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key }), projectId: key.project_id }, name);
  return { db: getFirestore(app), projectId: key.project_id };
}

/** Production reader backed by the website's Firestore. */
export async function firestoreWebsiteReader(): Promise<WebsiteReader & { projectId: string }> {
  const { db, projectId } = await websiteDb();
  return {
    projectId,
    async users() {
      const snap = await db.collection("users").select(...USER_FIELDS).limit(MAX_DOCS).get();
      return snap.docs.map((d) => toWebsiteUser(d.id, d.data()));
    },
    async orders() {
      const snap = await db.collection("orders").select(...ORDER_FIELDS).limit(MAX_DOCS).get();
      return snap.docs.map((d) => toWebsiteOrder(d.id, d.data()));
    },
  };
}

/** Cheap connectivity check: counts both collections without reading documents. */
export async function testWebsiteConnection() {
  const { db, projectId } = await websiteDb();
  const [users, orders] = await Promise.all([db.collection("users").count().get(), db.collection("orders").count().get()]);
  return { projectId, users: users.data().count, orders: orders.data().count };
}
