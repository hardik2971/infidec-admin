"use client";

import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink, Eye, KeyRound, RefreshCw, Search, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { CatalogDrift } from "@/lib/website/catalog";
import type { LastSync, SyncStats } from "@/lib/website/sync";
import { applyWebsitePricesAction, checkCatalogAction, replaceWebsiteKeyAction, syncWebsiteAction } from "./actions";

export function WebsiteKeyForm({ encryptionReady, hasKey, baseUrl }: { encryptionReady: boolean; hasKey: boolean; baseUrl: string }) {
  const [json, setJson] = useState("");
  const [url, setUrl] = useState(baseUrl);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <KeyRound className="size-4 text-primary" /> {hasKey ? "Replace website key" : "Add website key"}
        </CardTitle>
        <CardDescription>
          Paste the service-account JSON from the website&apos;s Firebase project. It is encrypted before it is stored and is only used to read data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!encryptionReady && <p className="text-sm text-destructive">Set INTEGRATION_ENCRYPTION_KEY on the server first.</p>}
        <Field>
          <FieldLabel htmlFor="web-url">Website address</FieldLabel>
          <Input id="web-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://marketplace-infidec.web.app" />
        </Field>
        <Field>
          <FieldLabel htmlFor="web-key">Service-account key (JSON)</FieldLabel>
          <Textarea id="web-key" rows={4} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"type": "service_account", …}' className="font-mono text-xs" autoComplete="off" spellCheck={false} />
          <FieldDescription>Grant this account only the Cloud Datastore Viewer role on the website project.</FieldDescription>
        </Field>
        <Button
          size="sm"
          disabled={pending || !encryptionReady || !json.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await replaceWebsiteKeyAction({ json, baseUrl: url });
              if (r.ok) {
                toast.success(r.message);
                setJson("");
              } else toast.error(r.error);
            })
          }
        >
          {pending ? <Spinner /> : <KeyRound />} Save key
        </Button>
      </CardContent>
    </Card>
  );
}

function StatsGrid({ s }: { s: SyncStats }) {
  const items: [string, number][] = [
    ["Website accounts", s.websiteUsers],
    ["Website orders", s.websiteOrders],
    ["New customers", s.customersCreated],
    ["Linked customers", s.customersLinked],
    ["New orders", s.ordersCreated],
    ["Status updates", s.ordersUpdated],
    ["Items skipped", s.itemsSkipped],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-lg border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-lg font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      {s.unmatchedSlugs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No admin product for: <span className="font-mono">{s.unmatchedSlugs.join(", ")}</span>
        </p>
      )}
      {s.warnings.slice(0, 5).map((w) => (
        <p key={w} className="text-xs text-muted-foreground">
          {w}
        </p>
      ))}
    </div>
  );
}

export function SyncCard({
  configured,
  canSync,
  lastSync,
  counts,
}: {
  configured: boolean;
  canSync: boolean;
  lastSync: LastSync | null;
  counts: { customers: number; orders: number; pending: number };
}) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<SyncStats | null>(null);
  const run = (dryRun: boolean) =>
    startTransition(async () => {
      const r = await syncWebsiteAction({ dryRun });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setPreview(dryRun ? r.stats : null);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <RefreshCw className="size-4 text-primary" /> Customers &amp; orders
        </CardTitle>
        <CardDescription>
          Website accounts become customers (matched by email). Each order item becomes a direct INFIDEC order, and running the sync again never creates duplicates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Imported orders stay pending</p>
            <p className="text-muted-foreground">
            The website marks orders as paid without a payment gateway, so the admin imports them as pending and unverified. Confirm each payment, then mark the order completed to issue the license.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge variant="outline">{counts.customers} website customer(s)</Badge>
          <Badge variant="outline">{counts.orders} website order(s)</Badge>
          <Badge variant="outline" className={counts.pending ? "border-warning/40 text-warning" : ""}>
            {counts.pending} awaiting payment check
          </Badge>
          <Link href="/orders" className="inline-flex items-center gap-1 text-primary hover:underline">
            Open orders <ArrowRight className="size-3" />
          </Link>
        </div>
        {canSync && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={pending || !configured} onClick={() => run(true)}>
              {pending ? <Spinner /> : <Eye />} Preview
            </Button>
            <Button size="sm" disabled={pending || !configured} onClick={() => run(false)}>
              {pending ? <Spinner /> : <RefreshCw />} Sync now
            </Button>
          </div>
        )}
        {preview && (
          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <p className="text-sm font-medium">Preview — nothing was saved</p>
            <StatsGrid s={preview} />
          </div>
        )}
        {lastSync ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Last sync {lastSync.at ? formatDateTime(lastSync.at) : "—"}
              {lastSync.byEmail ? ` by ${lastSync.byEmail}` : ""}
            </p>
            <StatsGrid s={lastSync} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No sync has run yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function money(v: number | null | undefined, currency: string) {
  return v == null ? "—" : formatMoney(v, currency);
}

export function CatalogCheck({ baseUrl, canApply }: { baseUrl: string; canApply: boolean }) {
  const [rows, setRows] = useState<CatalogDrift[] | null>(null);
  const [pending, startTransition] = useTransition();
  const check = () =>
    startTransition(async () => {
      const r = await checkCatalogAction();
      if (!r.ok) return void toast.error(r.error);
      setRows(r.rows);
      toast.success(r.message);
    });
  const apply = (productId: string) =>
    startTransition(async () => {
      const r = await applyWebsitePricesAction(productId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      const fresh = await checkCatalogAction();
      if (fresh.ok) setRows(fresh.rows);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-[15px]">
          <span>Catalogue check</span>
          <Button variant="outline" size="sm" disabled={pending} onClick={check}>
            {pending ? <Spinner /> : <Search />} Check live prices
          </Button>
        </CardTitle>
        <CardDescription>
          Compares each product&apos;s prices with its live page on{" "}
          <a href={baseUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {baseUrl.replace(/^https:\/\//, "")}
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!rows ? (
          <p className="text-sm text-muted-foreground">Run a check to compare prices.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products are linked to website pages.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Regular (admin / website)</TableHead>
                <TableHead className="text-right">Extended (admin / website)</TableHead>
                <TableHead className="text-right">Original (admin / website)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const c = r.admin.currency;
                return (
                  <TableRow key={r.productId}>
                    <TableCell>
                      <Link href={`/products/${r.productId}`} className="font-medium hover:underline">
                        {r.productName}
                      </Link>
                      <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-muted-foreground hover:text-foreground" aria-label="Open website page">
                        <ExternalLink className="size-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {money(r.admin.regular, c)} / {money(r.website?.regular, c)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {money(r.admin.extended, c)} / {money(r.website?.extended, c)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {money(r.admin.compareAt, c)} / {money(r.website?.compareAt, c)}
                    </TableCell>
                    <TableCell>
                      {r.error ? (
                        <span className="text-xs text-destructive">{r.error}</span>
                      ) : r.ok ? (
                        <Badge variant="outline" className="gap-1 border-success/40 text-success">
                          <CheckCircle2 className="size-3" /> Matches
                        </Badge>
                      ) : (
                        <span className="text-xs text-warning">{r.differences.join(", ")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canApply && !r.ok && !r.error && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => apply(r.productId)}>
                          <Wand2 /> Use website prices
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
