import type { Metadata } from "next";
import { Suspense } from "react";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { encryptionConfigured } from "@/lib/crypto";
import { getIntegrationStatus } from "@/lib/integrations/settings";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { EnvatoItems, EnvatoTokenForm } from "./envato-forms";

export const metadata: Metadata = { title: "Envato API" };

async function Envato() {
  const session = await requirePermission("integrations:view");
  const [status, products] = await Promise.all([getIntegrationStatus("envato"), listProducts()]);
  const canManage = hasPermission(session.permissions, "integrations:manage_settings");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <IntegrationCard
          id="envato"
          title="Envato Market API"
          description="Used for purchase-code verification and item information. Only official, documented endpoints are called."
          status={status}
          canTest={hasPermission(session.permissions, "integrations:edit")}
          canManage={canManage}
        />
        {canManage && <EnvatoTokenForm encryptionReady={encryptionConfigured()} hasToken={status.configured} />}
      </div>
      <EnvatoItems
        configured={status.configured}
        products={products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name, itemId: p.marketplaceItemId }))}
      />
    </div>
  );
}

export default function EnvatoPage() {
  return (
    <>
      <PageHeader
        title="Envato API"
        description="Connect your Envato author account with a personal token. The token is encrypted on the server and never sent to the browser."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Envato />
      </Suspense>
    </>
  );
}
