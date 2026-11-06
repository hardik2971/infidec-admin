import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getEmailSettings, listEmailLogs, smtpConfig } from "@/lib/email/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { SmtpPanel } from "./smtp-panel";

export const metadata: Metadata = { title: "SMTP & Email" };

async function Smtp() {
  const session = await requirePermission("integrations:view");
  const [settings, logs] = await Promise.all([getEmailSettings(), listEmailLogs()]);
  const c = smtpConfig();
  return (
    <SmtpPanel
      config={{ configured: c.configured, host: c.host, port: c.port, username: c.username, fromAddress: c.fromAddress, fromName: c.fromName, passwordSet: c.passwordSet }}
      settings={settings}
      logs={logs}
      staffEmail={session.email}
      canTest={hasPermission(session.permissions, "integrations:edit")}
      canManage={hasPermission(session.permissions, "integrations:manage_settings")}
    />
  );
}

export default function SmtpPage() {
  return (
    <>
      <PageHeader
        title="SMTP & Email"
        description="Outgoing email for purchases, licenses, support replies, refunds, downloads and product updates. The SMTP password stays in server secrets."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Smtp />
      </Suspense>
    </>
  );
}
