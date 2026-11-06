"use client";

import { Globe } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ProductActions, type ProductCapabilities } from "@/components/products/product-actions";
import { ProductThumb } from "@/components/products/product-thumb";
import { StatusBadge } from "@/components/products/status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PRODUCT_STATUSES, STATUS_LABELS, type ProductStatus } from "@/lib/products/schema";

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  status: ProductStatus;
  version: string;
  category: string;
  currency: string;
  regular: number;
  extended: number | null;
  thumbnailMediaId: string | null;
  updatedAt: string | null;
  imported: boolean;
}

export function ProductsTable({ products, caps }: { products: ProductRow[]; caps: ProductCapabilities }) {
  const [filter, setFilter] = useState<ProductStatus | "all">("all");
  const counts = useMemo(() => {
    const c = Object.fromEntries(PRODUCT_STATUSES.map((s) => [s, 0])) as Record<ProductStatus, number>;
    products.forEach((p) => c[p.status]++);
    return c;
  }, [products]);
  const rows = useMemo(() => (filter === "all" ? products : products.filter((p) => p.status === filter)), [products, filter]);

  const columns = useMemo<DataTableColumn<ProductRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Link href={`/products/${p.id}`} className="group flex items-center gap-3">
              <ProductThumb mediaId={p.thumbnailMediaId} alt="" className="w-20 shrink-0" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                  {p.name}
                  {p.imported && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Globe className="size-3.5 text-muted-foreground" aria-label="Imported from infidec.com" />
                      </TooltipTrigger>
                      <TooltipContent>Imported from infidec.com</TooltipContent>
                    </Tooltip>
                  )}
                </p>
                <p className="max-w-xs truncate text-xs text-muted-foreground">{p.tagline || p.slug}</p>
              </div>
            </Link>
          );
        },
      },
      { accessorKey: "category", header: "Category", cell: ({ row }) => <span className="text-sm">{row.original.category}</span> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        accessorKey: "version",
        header: "Version",
        cell: ({ row }) => <span className="font-mono text-xs">v{row.original.version}</span>,
      },
      {
        accessorKey: "regular",
        header: "Price",
        cell: ({ row }) => {
          const p = row.original;
          if (!p.regular) return <span className="text-sm text-muted-foreground">Not set</span>;
          return (
            <div className="text-sm tabular">
              <p>{formatMoney(p.regular, p.currency)}</p>
              {p.extended !== null && <p className="text-xs text-muted-foreground">Ext. {formatMoney(p.extended, p.currency)}</p>}
            </div>
          );
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => <span className="text-xs text-muted-foreground tabular">{formatDateTime(row.original.updatedAt)}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ProductActions product={row.original} caps={caps} />
          </div>
        ),
      },
    ],
    [caps],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchText={(p) => `${p.name} ${p.slug} ${p.tagline} ${p.category}`}
      searchPlaceholder="Search products…"
      emptyTitle={filter === "all" ? "No products yet" : `No ${STATUS_LABELS[filter as ProductStatus].toLowerCase()} products`}
      emptyDescription={filter === "all" ? "Import the catalogue from infidec.com or add a product with the wizard." : undefined}
      toolbar={
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-0.5" role="tablist" aria-label="Filter by status">
          {(["all", ...PRODUCT_STATUSES] as const).map((s) => (
            <Button
              key={s}
              role="tab"
              aria-selected={filter === s}
              size="sm"
              variant={filter === s ? "secondary" : "ghost"}
              className={`h-7 gap-1.5 px-2.5 text-xs ${filter === s ? "shadow-xs" : "text-muted-foreground"}`}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span className="text-[10px] tabular opacity-70">{s === "all" ? products.length : counts[s]}</span>
            </Button>
          ))}
        </div>
      }
    />
  );
}
