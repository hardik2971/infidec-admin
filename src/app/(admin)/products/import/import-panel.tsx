"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Copy, Download, ExternalLink, ImageIcon, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImportPreviewItem, ImportResult } from "@/lib/products/import";
import { cn } from "@/lib/utils";
import { importProductAction } from "./actions";

type RowState = { phase: "importing" } | { phase: "done"; result: ImportResult } | { phase: "failed"; error: string };

const price = (n: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export function ImportPanel({ items, canPublish }: { items: ImportPreviewItem[]; canPublish: boolean }) {
  const importable = items.filter((i) => !i.duplicate);
  const [selected, setSelected] = useState<Set<string>>(new Set(importable.map((i) => i.sourceSlug)));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [status, setStatus] = useState<"published" | "draft">(canPublish ? "published" : "draft");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const running = Object.values(rows).some((r) => r.phase === "importing");

  function toggle(slug: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  async function runImport() {
    setConfirmOpen(false);
    const queue = items.filter((i) => selected.has(i.sourceSlug) && !i.duplicate);
    let done = 0;
    for (const item of queue) {
      setRows((r) => ({ ...r, [item.sourceSlug]: { phase: "importing" } }));
      const res = await importProductAction({ sourceSlug: item.sourceSlug, status });
      setRows((r) => ({
        ...r,
        [item.sourceSlug]: res.ok ? { phase: "done", result: res.result } : { phase: "failed", error: res.error },
      }));
      if (res.ok) done++;
    }
    setSelected(new Set());
    if (done === queue.length) toast.success(`Imported ${done} product${done === 1 ? "" : "s"}.`);
    else toast.warning(`Imported ${done} of ${queue.length}. Check the failed rows.`);
  }

  const selectedCount = [...selected].filter((s) => importable.some((i) => i.sourceSlug === s)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} products on the website · {importable.length} new · {items.length - importable.length} already in the admin
        </p>
        <Button onClick={() => setConfirmOpen(true)} disabled={selectedCount === 0 || running}>
          {running ? <Spinner /> : <Download />} Import {selectedCount || ""} selected
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const row = rows[item.sourceSlug];
          const disabled = !!item.duplicate || running || row?.phase === "done";
          return (
            <Card key={item.sourceSlug} className={cn("gap-0 p-0 transition-opacity", item.duplicate && !row && "opacity-80")}>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                <div className="flex items-start gap-3 sm:w-[38%]">
                  <Checkbox
                    className="mt-1"
                    checked={selected.has(item.sourceSlug) && !item.duplicate}
                    disabled={disabled}
                    onCheckedChange={(v) => toggle(item.sourceSlug, v === true)}
                    aria-label={`Select ${item.name}`}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.tagline}</p>
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View on website <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>

                <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Category</dt>
                    <dd>{item.category}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Version</dt>
                    <dd className="tabular">v{item.version}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Regular / Extended</dt>
                    <dd className="tabular">
                      {price(item.regularPrice, item.currency)} / {price(item.extendedPrice, item.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Media</dt>
                    <dd className="inline-flex items-center gap-1 tabular">
                      <ImageIcon className="size-3.5 text-muted-foreground" />
                      {item.screenshots + (item.hasThumbnail ? 1 : 0)} images
                    </dd>
                  </div>
                </dl>

                <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                  {item.liveVerification?.ok ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1 border-success/40 text-success">
                          <ShieldCheck className="size-3" /> Matches live page
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Name and prices were confirmed on infidec.com when the snapshot was taken.</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
                          <AlertTriangle className="size-3" /> Not verified
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {item.liveVerification?.mismatches.join(" · ") ?? "The snapshot was not checked against the live page."}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {item.duplicate && (
                    <Badge variant="secondary" className="gap-1">
                      <Copy className="size-3" />
                      <Link href={`/products/${item.duplicate.productId}`} className="hover:underline">
                        Already imported
                      </Link>
                    </Badge>
                  )}
                  {item.duplicate && <span className="text-[11px] text-muted-foreground">Matched by {item.duplicate.reason}</span>}
                </div>
              </div>

              {row && (
                <div
                  className={cn(
                    "flex items-start gap-2 border-t px-4 py-3 text-sm",
                    row.phase === "failed" && "bg-destructive/5 text-destructive",
                    row.phase === "done" && "bg-success/5",
                  )}
                >
                  {row.phase === "importing" && (
                    <>
                      <Spinner className="mt-0.5" /> Importing details and copying images from infidec.com…
                    </>
                  )}
                  {row.phase === "failed" && (
                    <>
                      <XCircle className="mt-0.5 size-4 shrink-0" /> {row.error}
                    </>
                  )}
                  {row.phase === "done" && (
                    <>
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      <div className="space-y-1">
                        <p>
                          Imported as <strong className="font-medium">{row.result.status}</strong> with {row.result.imagesImported} image(s).{" "}
                          <Link href={`/products/${row.result.productId}`} className="font-medium text-primary hover:underline">
                            Open product
                          </Link>
                        </p>
                        {row.result.imageFailures.length > 0 && (
                          <p className="text-xs text-warning">
                            {row.result.imageFailures.length} image(s) could not be copied: {row.result.imageFailures[0].error}
                          </p>
                        )}
                        {row.result.notes.map((n) => (
                          <p key={n} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CircleDashed className="size-3" /> {n}
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Imported: name, title, descriptions, category, pricing, version, release date, technologies, integrations, modules,
        features, requirements, “what you get”, demo links, SEO and every product image. Ratings and sales counts shown on
        the website are not imported — sales figures only come from verified marketplace and order records.
      </p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Import {selectedCount} product{selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Product details are saved to Firestore and every image is copied from infidec.com into private Firebase
              Storage. This can take a little while per product.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2" role="radiogroup" aria-label="Status after import">
            <p className="text-sm font-medium">Status after import</p>
            {(
              [
                ["published", "Published", "They're already live on infidec.com.", !canPublish],
                ["draft", "Draft", "Review each product before publishing.", false],
              ] as const
            ).map(([value, label, hint, disabled]) => (
              <Label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal",
                  status === value && "border-primary/50 bg-accent",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="import-status"
                  className="mt-1 accent-[var(--primary)]"
                  checked={status === value}
                  disabled={disabled}
                  onChange={() => setStatus(value)}
                />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {disabled ? "Your role can't publish products." : hint}
                  </span>
                </span>
              </Label>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runImport}>Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
