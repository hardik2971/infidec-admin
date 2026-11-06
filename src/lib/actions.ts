import "server-only";

import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/session";
import { ProductError } from "@/lib/products/service";

/** Result shape returned by every Server Action. */
export type Result<T = object> = ({ ok: true; message: string } & T) | { ok: false; error: string };

/** User-facing domain error (validation, conflicts, missing records). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function failure(error: unknown, scope: string): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof ProductError || error instanceof DomainError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Please check the form." };
  console.error(`[${scope}]`, error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export const docId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid id.");
