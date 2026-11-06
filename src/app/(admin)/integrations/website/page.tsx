import type { Metadata } from "next";
import { Suspense } from "react";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { encryptionConfigured } from "@/lib/crypto";
import { getIntegrationStatus } from "@/lib/integrations/settings";
import { hasPermission } from "@/lib/rbac/permissions";
import { getLastSync, websiteImportCounts } from "@/lib/website/sync";
import { CatalogCheck, SyncCard, WebsiteKeyForm } from "./website-panel";

export const metadata: Metadata = { title: "Infidec Website" };

async function Website() {
  const session = await requirePermission("integrations:view");
  const [status, lastSync, counts] = await Promise.all([getIntegrationStatus("website"), getLastSync(), websiteImportCounts()]);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);
  const baseUrl = status.publicConfig.baseUrl || "https://marketplace-infidec.web.app";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <IntegrationCard
            id="website"
            title="Website database (read-only)"
            description={`Reads customer accounts and orders from ${status.publicConfig.projectId || "the website's Firebase project"}. The admin never writes to the website, and password hashes are never read.`}
            status={status}
            canTest={can("integrations:edit")}
            canManage={can("integrations:manage_settings")}
          />
          {can("integrations:manage_settings") && <WebsiteKeyForm encryptionReady={encryptionConfigured()} hasKey={status.configured} baseUrl={baseUrl} />}
        </div>
        <SyncCard configured={status.configured} canSync={can("integrations:edit")} lastSync={lastSync} counts={counts} />
      </div>
      <CatalogCheck baseUrl={baseUrl} canApply={can("products:edit")} />
    </div>
  );
}

export default function WebsitePage() {
  return (
    <>
      <PageHeader
        title="Infidec Website"
        description="Keep the admin in step with marketplace-infidec.web.app: import website customers and orders, and check that product prices match."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Website />
      </Suspense>
    </>
  );
}
