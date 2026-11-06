import { CalendarClock, KeyRound, LifeBuoy, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { LicensesTable } from "@/components/sales/licenses-table";
import { StatCard } from "@/components/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { supportActive, supportEndingWithin } from "@/lib/sales/schema";
import { listCustomers, listLicenses } from "@/lib/sales/service";

export const metadata: Metadata = { title: "License Activations" };

async function Activations() {
  const session = await requirePermission("licenses:view");
  const [licenses, customers, products] = await Promise.all([listLicenses(), listCustomers(), listProducts()]);
  const active = licenses.filter((l) => l.status === "active");
  const supported = active.filter((l) => supportActive(l));
  const soon = supportEndingWithin(supported, 30);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active licenses" icon={KeyRound} tone="primary" value={formatNumber(active.length)} />
        <StatCard label="With active support" icon={LifeBuoy} tone="success" value={formatNumber(supported.length)} />
        <StatCard label="Support ends within 30 days" icon={CalendarClock} tone="warning" value={formatNumber(soon.length)} />
        <StatCard label="Revoked or refunded" icon={ShieldOff} value={formatNumber(licenses.length - active.length)} />
      </div>
      <LicensesTable
        licenses={active.sort((a, b) => (a.supportExpiry ?? "").localeCompare(b.supportExpiry ?? ""))}
        customerNames={Object.fromEntries(customers.map((c) => [c.id, c.name]))}
        productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
        canEdit={hasPermission(session.permissions, "licenses:edit")}
      />
    </div>
  );
}

export default function ActivationsPage() {
  return (
    <>
      <PageHeader
        title="License Activations"
        description="Support entitlement for every active license. Licenses aren't tied to domains or devices — INFIDEC doesn't impose activation limits beyond the official license terms."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Activations />
      </Suspense>
    </>
  );
}
