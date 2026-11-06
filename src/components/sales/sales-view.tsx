import { CheckCircle2, Clock, Receipt, Wallet } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatMoney, formatNumber } from "@/lib/format";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listCustomers, listOrders } from "@/lib/sales/service";
import { OrderDialog } from "./order-dialog";
import { OrdersTable } from "./orders-table";

const SETTLED = new Set(["completed", "partially_refunded"]);

/** Orders list with honest per-currency totals; shared by Orders, Marketplace Sales and Direct Sales. */
export async function SalesView({ channel }: { channel?: "marketplace" | "direct" }) {
  const session = await requirePermission("orders:view");
  const [orders, customers, products] = await Promise.all([listOrders({ channel }), listCustomers(), listProducts()]);
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name]));

  // Never mix currencies in one total.
  const byCurrency = new Map<string, { gross: number; earnings: number; count: number }>();
  for (const o of orders.filter((x) => SETTLED.has(x.status))) {
    const t = byCurrency.get(o.currency) ?? { gross: 0, earnings: 0, count: 0 };
    t.gross += o.grossAmount;
    t.earnings += o.channel === "direct" ? o.grossAmount : (o.authorEarnings ?? 0);
    t.count++;
    byCurrency.set(o.currency, t);
  }
  const currencies = [...byCurrency.entries()];
  const pending = orders.filter((o) => o.status === "pending").length;
  const unverified = orders.filter((o) => o.channel === "marketplace" && o.verificationStatus !== "verified").length;

  const perProduct = new Map<string, number>();
  orders.filter((o) => SETTLED.has(o.status)).forEach((o) => perProduct.set(o.productId, (perProduct.get(o.productId) ?? 0) + 1));
  const topProducts = [...perProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Settled orders" icon={CheckCircle2} tone="success" value={formatNumber(orders.filter((o) => SETTLED.has(o.status)).length)} hint={`${formatNumber(orders.length)} recorded in total`} />
        <StatCard
          label={channel === "marketplace" ? "Gross (as reported)" : "Gross sales"}
          icon={Receipt}
          tone="primary"
          value={currencies.length ? currencies.map(([c, t]) => formatMoney(t.gross, c)).join(" · ") : "—"}
          hint={currencies.length > 1 ? "Shown per currency — never converted" : undefined}
        />
        <StatCard
          label={channel === "direct" ? "Revenue" : "Author earnings"}
          icon={Wallet}
          tone="violet"
          value={currencies.length ? currencies.map(([c, t]) => formatMoney(t.earnings, c)).join(" · ") : "—"}
          hint={channel === "direct" ? undefined : "Marketplace orders without confirmed earnings count as 0"}
        />
        <StatCard
          label={channel === "marketplace" ? "Unverified orders" : "Pending orders"}
          icon={Clock}
          tone="warning"
          value={formatNumber(channel === "marketplace" ? unverified : pending)}
          hint={channel === "marketplace" ? "Entered manually, not confirmed by Envato" : undefined}
        />
      </div>

      {topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px]">Settled orders by product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topProducts.map(([pid, n]) => (
              <div key={pid} className="flex items-center gap-3 text-sm">
                <span className="w-36 truncate">{productNames[pid] ?? "Unknown"}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(n / topProducts[0][1]) * 100}%` }} />
                </div>
                <span className="w-10 text-right tabular">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <OrdersTable
        orders={orders}
        customerNames={Object.fromEntries(customers.map((c) => [c.id, c.name]))}
        productNames={productNames}
        canEdit={hasPermission(session.permissions, "orders:edit")}
        toolbar={
          hasPermission(session.permissions, "orders:create") ? (
            <OrderDialog
              customers={customers.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name, email: c.email }))}
              products={products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name, currency: p.pricing.currency }))}
            />
          ) : null
        }
      />
    </div>
  );
}
