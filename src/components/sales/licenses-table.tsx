"use client";

import { Ban, MoreHorizontal, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { setLicenseStatusAction } from "@/app/(admin)/customers/actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { LicenseStatusBadge } from "@/components/sales/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";
import { LICENSE_TYPE_LABELS, marketplaceLabel, type LicenseRecord } from "@/lib/sales/schema";

const day = (iso: string | null) => (iso ? formatDateTime(iso).split(",")[0] : "—");

export function LicensesTable({
  licenses,
  customerNames,
  productNames,
  canEdit,
  showCustomer = true,
  toolbar,
}: {
  licenses: LicenseRecord[];
  customerNames: Record<string, string>;
  productNames: Record<string, string>;
  canEdit: boolean;
  showCustomer?: boolean;
  toolbar?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const columns = useMemo<DataTableColumn<LicenseRecord>[]>(() => {
    const cols: DataTableColumn<LicenseRecord>[] = [
      {
        accessorKey: "licenseKey",
        header: "License",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-medium">{row.original.licenseKey}</p>
            <p className="text-xs text-muted-foreground">
              {LICENSE_TYPE_LABELS[row.original.licenseType]} · {productNames[row.original.productId] ?? "—"}
            </p>
          </div>
        ),
      },
    ];
    if (showCustomer) {
      cols.push({
        accessorKey: "customerId",
        header: "Customer",
        cell: ({ row }) => (
          <Link href={`/customers/${row.original.customerId}`} className="text-sm hover:text-primary">
            {customerNames[row.original.customerId] ?? "—"}
          </Link>
        ),
      });
    }
    cols.push(
      {
        accessorKey: "marketplace",
        header: "Source",
        cell: ({ row }) => {
          const l = row.original;
          return (
            <div className="text-xs">
              <p>{marketplaceLabel(l.marketplace)}</p>
              {l.purchaseCodeLast4 && <p className="font-mono text-muted-foreground">Code …{l.purchaseCodeLast4}</p>}
              {l.marketplaceBuyer && <p className="text-muted-foreground">Buyer {l.marketplaceBuyer}</p>}
            </div>
          );
        },
      },
      { accessorKey: "purchaseDate", header: "Purchased", cell: ({ row }) => <span className="text-xs tabular">{day(row.original.purchaseDate)}</span> },
      {
        accessorKey: "supportExpiry",
        header: "Support until",
        cell: ({ row }) => <span className="text-xs tabular">{row.original.supportExpiry ? day(row.original.supportExpiry) : <Badge variant="outline">Not provided</Badge>}</span>,
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <LicenseStatusBadge license={row.original} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          if (!canEdit || l.status === "refunded") return null;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${l.licenseKey}`} disabled={pending}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {l.status === "active" ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        startTransition(async () => {
                          const r = await setLicenseStatusAction({ id: l.id, status: "revoked" });
                          if (r.ok) toast.success(r.message);
                          else toast.error(r.error);
                        })
                      }
                    >
                      <Ban /> Revoke
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() =>
                        startTransition(async () => {
                          const r = await setLicenseStatusAction({ id: l.id, status: "active" });
                          if (r.ok) toast.success(r.message);
                          else toast.error(r.error);
                        })
                      }
                    >
                      <RotateCcw /> Reactivate
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    );
    return cols;
  }, [canEdit, customerNames, pending, productNames, showCustomer]);

  return (
    <DataTable
      columns={columns}
      data={licenses}
      searchText={(l) => `${l.licenseKey} ${customerNames[l.customerId] ?? ""} ${productNames[l.productId] ?? ""} ${l.marketplaceBuyer ?? ""} ${l.purchaseCodeLast4 ?? ""}`}
      searchPlaceholder="Search key, customer, buyer or code ending…"
      emptyTitle="No licenses yet"
      emptyDescription="Licenses are created when a purchase code is verified or a direct order is completed."
      toolbar={toolbar}
    />
  );
}
