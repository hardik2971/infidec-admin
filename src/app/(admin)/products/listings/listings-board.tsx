"use client";

import { Plus, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import type { ListingRecord } from "@/lib/listings/schema";
import { createListingAction } from "./actions";

type Row = ListingRecord & { readiness: { done: number; total: number } };

export function ListingsBoard({
  listings,
  products,
  marketplaces,
  canCreate,
}: {
  listings: Row[];
  products: { id: string; name: string }[];
  marketplaces: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [marketplaceId, setMarketplaceId] = useState(marketplaces[0]?.id ?? "envato");
  const [pending, startTransition] = useTransition();
  const names = Object.fromEntries(products.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus /> New submission
          </Button>
        </div>
      )}
      {listings.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Store />
            </EmptyMedia>
            <EmptyTitle>No submissions yet</EmptyTitle>
            <EmptyDescription>Start a submission — it&apos;s prefilled from the product&apos;s details, latest version, packages and media.</EmptyDescription>
          </EmptyHeader>
          {canCreate && (
            <EmptyContent>
              <Button onClick={() => setOpen(true)}>
                <Plus /> New submission
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {listings.map((l) => (
            <Link key={l.id} href={`/products/listings/${l.id}`}>
              <Card className="h-full gap-0 py-0 transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.itemTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {names[l.productId] ?? "Product"} · {l.marketplaceId === "envato" ? "CodeCanyon" : l.marketplaceId}
                        {l.resubmissions > 0 && ` · resubmission ${l.resubmissions}`}
                      </p>
                    </div>
                    <ListingStatusBadge status={l.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(l.readiness.done / l.readiness.total) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular">
                      {l.readiness.done}/{l.readiness.total} checks
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Updated {formatDateTime(l.updatedAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New marketplace submission</DialogTitle>
            <DialogDescription>Prefilled from the product. You can edit everything before submitting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="ls-product">Product</FieldLabel>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="ls-product" className="w-full">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ls-market">Marketplace</FieldLabel>
              <Select value={marketplaceId} onValueChange={setMarketplaceId}>
                <SelectTrigger id="ls-market" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketplaces.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !productId}
              onClick={() =>
                startTransition(async () => {
                  const r = await createListingAction({ productId, marketplaceId });
                  if (r.ok) router.push(`/products/listings/${r.id}`);
                  else toast.error(r.error);
                })
              }
            >
              {pending && <Spinner />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
