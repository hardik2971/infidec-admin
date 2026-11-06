import type { Metadata } from "next";
import { Suspense } from "react";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { encryptionConfigured } from "@/lib/crypto";
import { getIntegrationStatus } from "@/lib/integrations/settings";
import { hasPermission } from "@/lib/rbac/permissions";
import { RazorpayForm } from "./razorpay-form";

export const metadata: Metadata = { title: "Payment Gateways" };

async function Payments() {
  const session = await requirePermission("integrations:view");
  const status = await getIntegrationStatus("razorpay");
  const canManage = hasPermission(session.permissions, "integrations:manage_settings");
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <IntegrationCard
        id="razorpay"
        title="Razorpay (direct sales)"
        description="Credentials for reconciling direct website payments. The admin never charges customers or issues gateway refunds itself."
        status={status}
        canTest={hasPermission(session.permissions, "integrations:edit")}
        canManage={canManage}
      />
      {canManage && <RazorpayForm encryptionReady={encryptionConfigured()} keyId={status.publicConfig.keyId ?? ""} />}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <>
      <PageHeader title="Payment Gateways" description="Direct-sale gateway credentials, stored encrypted on the server. Marketplace payments are handled entirely by the marketplace." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Payments />
      </Suspense>
    </>
  );
}
