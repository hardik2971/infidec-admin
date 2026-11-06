"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { setOrderStatusAction } from "@/app/(admin)/customers/actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { OrderStatusBadge, VerificationBadge } from "@/components/sales/badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, formatMoney } from "@/lib/format";
import { LICENSE_TYPE_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, marketplaceLabel, type OrderRecord, type OrderStatus } from "@/lib/sales/schema";

export function OrdersTable({
  orders,
  customerNames,
  productNames,
  canEdit,
  toolbar,
  showCustomer = true,
}: {
  orders: OrderRecord[];
  customerNames: Record<string, string>;
  productNames: Record<string, string>;
  canEdit: boolean;
  toolbar?: React.ReactNode;
  showCustomer?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const columns = useMemo<DataTableColumn<OrderRecord>[]>(() => {
    const cols: DataTableColumn<OrderRecord>[] = [
      {
        accessorKey: "orderNumber",
        header: "Order",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-medium">{row.original.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(row.original.purchaseDate).split(",")[0]}</p>
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
      { accessorKey: "productId", header: "Product", cell: ({ row }) => <span className="text-sm">{productNames[row.original.productId] ?? "—"}</span> },
      {
        accessorKey: "marketplace",
        header: "Channel",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{marketplaceLabel(row.original.marketplace)}</p>
            <p className="text-muted-foreground">{LICENSE_TYPE_LABELS[row.original.licenseType]} license</p>
          </div>
        ),
      },
      {
        accessorKey: "grossAmount",
        header: "Amount",
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="text-sm tabular">
              <p>{formatMoney(o.grossAmount, o.currency)}</p>
              {o.authorEarnings !== null && o.channel === "marketplace" && (
                <p className="text-xs text-muted-foreground">Earned {formatMoney(o.authorEarnings, o.currency)}</p>
              )}
            </div>
          );
        },
      },
      { accessorKey: "verificationStatus", header: "Verification", cell: ({ row }) => <VerificationBadge status={row.original.verificationStatus} /> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <OrderStatusBadge status={row.original.status} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) =>
          canEdit ? (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.orderNumber}`} disabled={pending}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Change status</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={row.original.status}
                    onValueChange={(status) =>
                      startTransition(async () => {
                        const r = await setOrderStatusAction({ id: row.original.id, status: status as OrderStatus });
                        if (r.ok) toast.success(r.message);
                        else toast.error(r.error);
                      })
                    }
                  >
                    {ORDER_STATUSES.map((s) => (
                      <DropdownMenuRadioItem key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null,
      },
    );
    return cols;
  }, [canEdit, customerNames, pending, productNames, showCustomer]);

  return (
    <DataTable
      columns={columns}
      data={orders}
      searchText={(o) => `${o.orderNumber} ${customerNames[o.customerId] ?? ""} ${productNames[o.productId] ?? ""} ${o.transactionRef} ${o.marketplace}`}
      searchPlaceholder="Search orders, customers, references…"
      emptyTitle="No orders yet"
      emptyDescription="Orders appear here when you record direct sales or verify marketplace purchase codes."
      toolbar={toolbar}
    />
  );
}
