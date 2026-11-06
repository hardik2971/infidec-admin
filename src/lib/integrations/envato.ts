import "server-only";

import { DomainError } from "@/lib/actions";
import { getIntegrationSecret, rateLimitedUntil, recordError } from "./settings";

/**
 * Official Envato Market API (https://build.envato.com/api/) using a personal token
 * kept server-side. Only documented endpoints are used:
 *   GET /v1/market/private/user/username.json   token owner (connection test)
 *   GET /v3/market/author/sale?code=…           sale lookup by purchase code
 *   GET /v3/market/catalog/item?id=…            public item details
 */
const API = "https://api.envato.com";

/** Envato purchase codes are UUIDs. */
export const PURCHASE_CODE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EnvatoError extends DomainError {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EnvatoError";
  }
}

async function request<T>(path: string): Promise<T> {
  const limited = await rateLimitedUntil("envato");
  if (limited) {
    throw new EnvatoError(`Envato asked us to slow down. Try again after ${limited.toLocaleTimeString("en-GB")}.`, 429);
  }
  const token = await getIntegrationSecret("envato");
  if (!token) throw new EnvatoError("The Envato API token isn't configured. Add it under Integrations → Envato API.", 0);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "INFIDEC Marketplace Admin" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    const msg = `Envato API unreachable: ${(error as Error).message}`;
    await recordError("envato", msg);
    throw new EnvatoError(msg, 0);
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? 60);
    const until = new Date(Date.now() + (Number.isFinite(retry) ? retry : 60) * 1000);
    await recordError("envato", "Rate limited by Envato (HTTP 429).", until);
    throw new EnvatoError(`Envato rate limit reached. Try again in ${Math.ceil(retry)} seconds.`, 429);
  }
  if (res.status === 401 || res.status === 403) {
    await recordError("envato", `Token rejected (HTTP ${res.status}).`);
    throw new EnvatoError("Envato rejected the API token. Check it's valid and has the required permissions.", res.status);
  }
  if (res.status === 404) throw new EnvatoError("Not found.", 404);
  if (!res.ok) {
    const msg = `Envato API error (HTTP ${res.status}).`;
    await recordError("envato", msg);
    throw new EnvatoError(msg, res.status);
  }
  return (await res.json()) as T;
}

export async function getTokenOwner(): Promise<string> {
  const r = await request<{ username?: string }>("/v1/market/private/user/username.json");
  if (!r.username) throw new EnvatoError("Unexpected response from Envato.", 200);
  return r.username;
}

export interface EnvatoSale {
  amount: number;
  soldAt: string;
  license: string;
  licenseType: "regular" | "extended";
  supportAmount: number;
  supportedUntil: string | null;
  buyer: string;
  purchaseCount: number;
  item: { id: number; name: string; url: string | null };
}

interface RawSale {
  amount?: string | number;
  sold_at?: string;
  license?: string;
  support_amount?: string | number;
  supported_until?: string | null;
  buyer?: string;
  purchase_count?: number;
  item?: { id?: number; name?: string; url?: string };
}

/** Looks up an author sale by purchase code. Returns null when the code isn't a sale of this author. */
export async function lookupSale(code: string): Promise<EnvatoSale | null> {
  if (!PURCHASE_CODE_RE.test(code.trim())) throw new EnvatoError("That doesn't look like an Envato purchase code (expected xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).", 400);
  let raw: RawSale;
  try {
    raw = await request<RawSale>(`/v3/market/author/sale?code=${encodeURIComponent(code.trim())}`);
  } catch (error) {
    if (error instanceof EnvatoError && error.status === 404) return null;
    throw error;
  }
  if (!raw.item?.id || !raw.sold_at) throw new EnvatoError("Envato returned an incomplete sale record.", 200);
  const license = String(raw.license ?? "");
  return {
    amount: Number(raw.amount ?? 0),
    soldAt: raw.sold_at,
    license,
    licenseType: /extended/i.test(license) ? "extended" : "regular",
    supportAmount: Number(raw.support_amount ?? 0),
    supportedUntil: raw.supported_until ?? null,
    buyer: String(raw.buyer ?? ""),
    purchaseCount: Number(raw.purchase_count ?? 1),
    item: { id: raw.item.id, name: String(raw.item.name ?? ""), url: raw.item.url ?? null },
  };
}

export interface EnvatoItem {
  id: number;
  name: string;
  numberOfSales: number | null;
  priceCents: number | null;
  rating: number | null;
  updatedAt: string | null;
  url: string | null;
}

export async function getItem(id: string): Promise<EnvatoItem | null> {
  if (!/^\d{1,12}$/.test(id)) throw new EnvatoError("Envato item IDs are numeric.", 400);
  try {
    const r = await request<{ id: number; name: string; number_of_sales?: number; price_cents?: number; rating?: { rating?: number }; updated_at?: string; url?: string }>(
      `/v3/market/catalog/item?id=${id}`,
    );
    return {
      id: r.id,
      name: r.name,
      numberOfSales: r.number_of_sales ?? null,
      priceCents: r.price_cents ?? null,
      rating: r.rating?.rating ?? null,
      updatedAt: r.updated_at ?? null,
      url: r.url ?? null,
    };
  } catch (error) {
    if (error instanceof EnvatoError && error.status === 404) return null;
    throw error;
  }
}
