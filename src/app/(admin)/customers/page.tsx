import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listCustomers } from "@/lib/sales/service";
import { CustomersTable } from "./customers-table";

export const metadata: Metadata = { title: "Customers" };

async function Customers() {
  const session = await requirePermission("customers:view");
  const [customers, products] = await Promise.all([listCustomers(), listProducts()]);
  return (
    <CustomersTable
      customers={customers}
      productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
      canCreate={hasPermission(session.permissions, "customers:create")}
    />
  );
}

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" description="Everyone who bought an INFIDEC product — on a marketplace or directly — with their purchases, licenses and support history." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Customers />
      </Suspense>
    </>
  );
}
