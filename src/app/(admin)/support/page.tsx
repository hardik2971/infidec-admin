import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listCustomers } from "@/lib/sales/service";
import { getCategories, listTickets } from "@/lib/support/service";
import { TicketsTable } from "./tickets-table";

export const metadata: Metadata = { title: "Support Tickets" };

async function Tickets() {
  const session = await requirePermission("support:view");
  const [tickets, customers, products, categories] = await Promise.all([listTickets(), listCustomers(), listProducts(), getCategories()]);
  return (
    <TicketsTable
      tickets={tickets}
      customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
      products={products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }))}
      categories={categories}
      currentUid={session.uid}
      canCreate={hasPermission(session.permissions, "support:create")}
    />
  );
}

export default function SupportPage() {
  return (
    <>
      <PageHeader title="Support Tickets" description="Customer conversations with support entitlement checked against their licenses." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Tickets />
      </Suspense>
    </>
  );
}
