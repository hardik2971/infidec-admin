import { requirePermission } from "@/lib/auth/session";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listRefunds } from "@/lib/refunds/service";
import { listCustomers, listOrders } from "@/lib/sales/service";
import { RefundsBoard } from "./refunds-board";

/** Open requests (`history = false`) or finished refunds (`history = true`). */
export async function RefundsView({ history }: { history: boolean }) {
  const session = await requirePermission("refunds:view");
  const [refunds, customers, products, orders] = await Promise.all([listRefunds(), listCustomers(), listProducts(), listOrders()]);
  const finished = (s: string) => s === "completed" || s === "rejected";
  const customerNames = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);

  return (
    <RefundsBoard
      refunds={refunds.filter((r) => finished(r.status) === history)}
      names={{ customers: customerNames, products: Object.fromEntries(products.map((p) => [p.id, p.name])) }}
      orders={
        history
          ? []
          : orders
              .filter((o) => (o.status === "completed" || o.status === "partially_refunded") && o.refundStatus !== "requested")
              .map((o) => ({
                id: o.id,
                label: `${o.orderNumber} · ${customerNames[o.customerId] ?? "Customer"} · ${(o.grossAmount / 100).toFixed(2)} ${o.currency}`,
                max: o.grossAmount / 100,
                currency: o.currency,
              }))
      }
      canCreate={!history && can("refunds:create")}
      canEdit={can("refunds:edit")}
      canApprove={can("refunds:approve")}
    />
  );
}
