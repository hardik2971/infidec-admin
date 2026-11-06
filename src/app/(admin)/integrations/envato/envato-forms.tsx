"use client";

import { ExternalLink, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { EnvatoItem } from "@/lib/integrations/envato";
import { formatDateTime } from "@/lib/format";
import { fetchEnvatoItemAction, saveEnvatoTokenAction } from "../actions";

export function EnvatoTokenForm({ encryptionReady, hasToken }: { encryptionReady: boolean; hasToken: boolean }) {
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">{hasToken ? "Replace token" : "Add personal token"}</CardTitle>
        <CardDescription>
          Create one at{" "}
          <a href="https://build.envato.com/create-token/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
            build.envato.com/create-token <ExternalLink className="size-3" />
          </a>{" "}
          with <strong className="font-medium">View your Envato account username</strong> and <strong className="font-medium">View your items&apos; sales history</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!encryptionReady ? (
          <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Set INTEGRATION_ENCRYPTION_KEY on the server to store credentials.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await saveEnvatoTokenAction(token);
                if (r.ok) {
                  toast.success(r.message);
                  setToken("");
                } else toast.error(r.error);
              });
            }}
          >
            <Field>
              <FieldLabel htmlFor="envato-token">Personal token</FieldLabel>
              <Input id="envato-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono" />
              <FieldDescription>Write-only: after saving, only the last four characters are shown.</FieldDescription>
            </Field>
            <Button type="submit" size="sm" disabled={pending || token.trim().length < 20}>
              {pending ? <Spinner /> : <Save />} Save token
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function EnvatoItems({ configured, products }: { configured: boolean; products: { id: string; name: string; itemId: string }[] }) {
  const [items, setItems] = useState<Record<string, EnvatoItem | null | "error">>({});
  const [loading, setLoading] = useState<string | null>(null);
  const mapped = products.filter((p) => p.itemId);

  async function load(itemId: string) {
    setLoading(itemId);
    const r = await fetchEnvatoItemAction(itemId);
    setLoading(null);
    if (r.ok) setItems((x) => ({ ...x, [itemId]: r.item }));
    else {
      setItems((x) => ({ ...x, [itemId]: "error" }));
      toast.error(r.error);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-[15px]">Item mapping</CardTitle>
        <CardDescription>Purchase codes are matched to products by their Envato item ID (set on each product&apos;s Marketplace tab).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {products.map((p) => {
          const item = p.itemId ? items[p.itemId] : undefined;
          return (
            <div key={p.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/products/${p.id}?tab=marketplace`} className="font-medium hover:text-primary">
                  {p.name}
                </Link>
                {p.itemId ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      #{p.itemId}
                    </Badge>
                    <Button size="icon-sm" variant="ghost" aria-label={`Fetch Envato item ${p.itemId}`} disabled={!configured || loading === p.itemId} onClick={() => load(p.itemId)}>
                      {loading === p.itemId ? <Spinner /> : <RefreshCw />}
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    No item ID
                  </Badge>
                )}
              </div>
              {item === null && <p className="mt-2 text-xs text-destructive">Envato has no item with this ID.</p>}
              {item && item !== "error" && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <dt>Envato name</dt>
                  <dd className="text-foreground">{item.name}</dd>
                  <dt>Sales (public count)</dt>
                  <dd className="text-foreground tabular">{item.numberOfSales ?? "—"}</dd>
                  <dt>Price</dt>
                  <dd className="text-foreground tabular">{item.priceCents !== null ? `$${(item.priceCents / 100).toFixed(2)}` : "—"}</dd>
                  <dt>Updated</dt>
                  <dd className="text-foreground">{item.updatedAt ? formatDateTime(item.updatedAt) : "—"}</dd>
                </dl>
              )}
            </div>
          );
        })}
        {!mapped.length && <p className="text-xs text-muted-foreground">No products have an Envato item ID yet — they appear once your items are approved on CodeCanyon.</p>}
      </CardContent>
    </Card>
  );
}
