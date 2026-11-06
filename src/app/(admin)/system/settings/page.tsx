import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { APP_TIME_ZONE } from "@/lib/format";
import { STORAGE_RULES_MAX_MB } from "@/lib/packages/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { getGeneralSettings } from "@/lib/settings/general";
import { GeneralSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "General Settings" };

async function Settings() {
  const session = await requirePermission("settings:view");
  const settings = await getGeneralSettings();
  return (
    <GeneralSettingsForm
      settings={settings}
      canEdit={hasPermission(session.permissions, "settings:manage_settings")}
      timeZone={APP_TIME_ZONE}
      maxUploadMb={STORAGE_RULES_MAX_MB}
      sessionDays={Number(process.env.SESSION_COOKIE_DAYS ?? 5)}
    />
  );
}

export default function GeneralSettingsPage() {
  return (
    <>
      <PageHeader title="General Settings" description="Platform name, currency, support contact and file-delivery limits." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Settings />
      </Suspense>
    </>
  );
}
