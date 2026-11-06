"use client";

import { CheckCircle2, CircleAlert, CircleDashed, KeyRound, PlugZap, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeIntegrationSecretAction, testIntegrationAction } from "@/app/(admin)/integrations/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import type { IntegrationId, IntegrationStatus } from "@/lib/integrations/settings";

export function IntegrationCard({
  id,
  title,
  description,
  status,
  canTest,
  canManage,
}: {
  id: IntegrationId;
  title: string;
  description: string;
  status: IntegrationStatus;
  canTest: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-[15px]">
          <span className="flex items-center gap-2">
            <PlugZap className="size-4 text-primary" /> {title}
          </span>
          {status.configured ? (
            status.lastTestOk === false ? (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <CircleAlert className="size-3" /> Failing
              </Badge>
            ) : status.lastTestOk ? (
              <Badge variant="outline" className="gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
                <CircleDashed className="size-3" /> Not tested
              </Badge>
            )
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3.5" /> Credential
            </dt>
            <dd className="mt-0.5 font-mono text-xs">
              {status.configured ? `${status.secretHint ?? "set"} · ${status.source === "environment" ? "from environment" : "encrypted in Firestore"}` : "—"}
            </dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">Last test</dt>
            <dd className="mt-0.5 text-xs">{status.lastTestAt ? `${formatDateTime(status.lastTestAt)} — ${status.lastTestMessage}` : "Never"}</dd>
          </div>
          {Object.entries(status.publicConfig).map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</dt>
              <dd className="mt-0.5 font-mono text-xs">{v}</dd>
            </div>
          ))}
          {status.lastError && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Last API error · {formatDateTime(status.lastErrorAt)}</dt>
              <dd className="mt-0.5 text-xs">{status.lastError}</dd>
              {status.rateLimitedUntil && <dd className="mt-1 text-xs text-warning">Paused until {formatDateTime(status.rateLimitedUntil)} (rate limit)</dd>}
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          {canTest && (
            <Button variant="outline" size="sm" disabled={pending || !status.configured} onClick={() => run(() => testIntegrationAction(id))}>
              {pending ? <Spinner /> : <PlugZap />} Test connection
            </Button>
          )}
          {canManage && status.source === "firestore" && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeIntegrationSecretAction(id))}>
              <Trash2 /> Remove stored secret
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
