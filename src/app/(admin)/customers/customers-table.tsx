"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { initials } from "@/components/layout/user-menu";
import { CustomerDialog } from "@/components/sales/customer-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { CustomerRecord } from "@/lib/sales/schema";

export function CustomersTable({ customers, productNames, canCreate }: { customers: CustomerRecord[]; productNames: Record<string, string>; canCreate: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const rows = status === "all" ? customers : customers.filter((c) => c.status === status);

  const columns = useMemo<DataTableColumn<CustomerRecord>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Customer",
        cell: ({ row }) => (
          <Link href={`/customers/${row.original.id}`} className="group flex items-center gap-3">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-accent text-xs font-semibold text-accent-foreground">{initials(row.original.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium group-hover:text-primary">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </Link>
        ),
      },
      {
        accessorKey: "company",
        header: "Company / country",
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.company || "—"}</p>
            <p className="text-xs text-muted-foreground">{row.original.country}</p>
          </div>
        ),
      },
      {
        accessorKey: "productIds",
        header: "Products",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex max-w-56 flex-wrap gap-1">
            {row.original.productIds.slice(0, 3).map((p) => (
              <Badge key={p} variant="secondary" className="text-[10.5px]">
                {productNames[p] ?? "—"}
              </Badge>
            ))}
            {row.original.productIds.length > 3 && <Badge variant="outline">+{row.original.productIds.length - 3}</Badge>}
          </div>
        ),
      },
      { accessorKey: "orderCount", header: "Orders", cell: ({ row }) => <span className="tabular">{row.original.orderCount}</span> },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <Badge variant="outline" className="border-success/40 text-success">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              Suspended
            </Badge>
          ),
      },
      { accessorKey: "createdAt", header: "Since", cell: ({ row }) => <span className="text-xs text-muted-foreground tabular">{formatDateTime(row.original.createdAt).split(",")[0]}</span> },
    ],
    [productNames],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchText={(c) => `${c.name} ${c.email} ${c.company} ${c.country} ${c.marketplaceUsername} ${c.phone}`}
        searchPlaceholder="Search name, email, company, Envato username…"
        emptyTitle="No customers yet"
        emptyDescription="Customers are added when purchase codes are verified, or you can add them manually."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border bg-card p-0.5">
              {(["all", "active", "suspended"] as const).map((s) => (
                <Button key={s} size="sm" variant={status === s ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs capitalize" onClick={() => setStatus(s)}>
                  {s}
                </Button>
              ))}
            </div>
            {canCreate && (
              <Button onClick={() => setOpen(true)}>
                <UserPlus /> Add customer
              </Button>
            )}
          </div>
        }
      />
      <CustomerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
