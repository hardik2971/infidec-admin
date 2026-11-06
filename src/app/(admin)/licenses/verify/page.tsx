import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/integrations/settings";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listCustomers } from "@/lib/sales/service";
import { VerifyPanel } from "./verify-panel";

export const metadata: Metadata = { title: "Verify Purchase Code" };

async function Verify() {
  const session = await requirePermission("licenses:view");
  const [status, products, customers] = await Promise.all([getIntegrationStatus("envato"), listProducts(), listCustomers()]);
  return (
    <VerifyPanel
      configured={status.configured}
      canRecord={hasPermission(session.permissions, "licenses:create") && hasPermission(session.permissions, "orders:create")}
      canConfigure={hasPermission(session.permissions, "integrations:edit")}
      products={products.map((p) => ({ id: p.id, name: p.name, itemId: p.marketplaceItemId }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email, username: c.marketplaceUsername }))}
    />
  );
}

export default function VerifyPage() {
  return (
    <>
      <PageHeader
        title="Verify Purchase Code"
        description="Checks a CodeCanyon purchase code with the official Envato Market API. Codes are never generated here — only verified."
      />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Verify />
      </Suspense>
    </>
  );
}
