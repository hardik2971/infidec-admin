"use client";

import { CheckCircle2, CircleAlert, Mail, PlugZap, RotateCcw, Save, Send } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { EmailLog, EmailSettings } from "@/lib/email/service";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, renderEmail, type TemplateKey } from "@/lib/email/templates";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveTemplateAction, sendTestEmailAction, setTemplateEnabledAction, verifySmtpAction } from "./actions";

type Config = { configured: boolean; host: string; port: number; username: string; fromAddress: string; fromName: string; passwordSet: boolean };

export function SmtpPanel({
  config,
  settings,
  logs,
  staffEmail,
  canTest,
  canManage,
}: {
  config: Config;
  settings: EmailSettings;
  logs: EmailLog[];
  staffEmail: string;
  canTest: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [testTo, setTestTo] = useState(staffEmail);
  const [testTemplate, setTestTemplate] = useState<TemplateKey>("purchase_confirmation");
  const [selected, setSelected] = useState<TemplateKey>("purchase_confirmation");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-[15px]">
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-primary" /> SMTP connection
              </span>
              {config.configured ? (
                <Badge variant="outline" className="gap-1 border-success/40 text-success">
                  <CheckCircle2 className="size-3" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                  <CircleAlert className="size-3" /> Not configured
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Set with MAIL_* environment variables; the password is a server secret.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                ["Server", config.host ? `${config.host}:${config.port}` : "—"],
                ["Encryption", config.port === 465 ? "SSL/TLS" : "STARTTLS"],
                ["Username", config.username || "—"],
                ["Password", config.passwordSet ? "Set (hidden)" : "Missing"],
                ["From", config.fromAddress ? `${config.fromName} <${config.fromAddress}>` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono text-xs">{v}</dd>
                </div>
              ))}
            </dl>
            {canTest && (
              <Button variant="outline" size="sm" disabled={pending || !config.configured} onClick={() => run(verifySmtpAction)}>
                {pending ? <Spinner /> : <PlugZap />} Verify connection
              </Button>
            )}
          </CardContent>
        </Card>

        {canTest && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Send a test email</CardTitle>
              <CardDescription>Uses sample values so you can check the layout in a real inbox.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field>
                <FieldLabel htmlFor="test-to">Recipient</FieldLabel>
                <Input id="test-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="test-template">Template</FieldLabel>
                <Select value={testTemplate} onValueChange={(v) => setTestTemplate(v as TemplateKey)}>
                  <SelectTrigger id="test-template" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {DEFAULT_TEMPLATES[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button size="sm" disabled={pending || !config.configured || !testTo} onClick={() => run(() => sendTestEmailAction({ to: testTo, template: testTemplate }))}>
                {pending ? <Spinner /> : <Send />} Send test
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Email templates</CardTitle>
          <CardDescription>Turn each notification on or off and edit its wording. Use {"{{placeholders}}"} for customer and order details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <ul className="space-y-1">
            {TEMPLATE_KEYS.map((k) => (
              <li key={k} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", selected === k ? "border-primary/40 bg-accent" : "border-transparent hover:bg-muted/60")}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(k)}>
                  <p className="truncate text-sm font-medium">{DEFAULT_TEMPLATES[k].label}</p>
                  <p className="truncate text-xs text-muted-foreground">{settings.templates[k].customised ? "Customised" : "Default wording"}</p>
                </button>
                <Switch
                  checked={settings.enabled[k]}
                  disabled={!canManage || pending}
                  onCheckedChange={(v) => run(() => setTemplateEnabledAction({ template: k, enabled: v }))}
                  aria-label={`Send ${DEFAULT_TEMPLATES[k].label} emails`}
                />
              </li>
            ))}
          </ul>
          <TemplateEditor key={selected + settings.templates[selected].subject + settings.templates[selected].body} templateKey={selected} value={settings.templates[selected]} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Email log</CardTitle>
          <CardDescription>The latest {logs.length} email attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground tabular">{formatDateTime(l.createdAt)}</TableCell>
                    <TableCell className="text-sm">{DEFAULT_TEMPLATES[l.template as TemplateKey]?.label ?? l.template}</TableCell>
                    <TableCell className="text-sm">{l.to}</TableCell>
                    <TableCell className="max-w-72 truncate text-sm text-muted-foreground">{l.subject ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={l.status === "sent" ? "border-success/40 text-success" : l.status === "failed" ? "border-destructive/40 text-destructive" : "text-muted-foreground"}
                      >
                        {l.status === "sent" ? "Sent" : l.status === "failed" ? "Failed" : "Skipped"}
                      </Badge>
                      {l.error && <p className="mt-1 max-w-56 text-xs text-muted-foreground">{l.error}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateEditor({ templateKey, value, canManage }: { templateKey: TemplateKey; value: { subject: string; body: string; customised: boolean }; canManage: boolean }) {
  const def = DEFAULT_TEMPLATES[templateKey];
  const [subject, setSubject] = useState(value.subject);
  const [body, setBody] = useState(value.body);
  const [pending, startTransition] = useTransition();
  const preview = useMemo(
    () => renderEmail({ subject, body }, Object.fromEntries(def.variables.map((v) => [v, v === "customerName" ? "Priya Shah" : `[${v}]`]))),
    [subject, body, def.variables],
  );
  const dirty = subject !== value.subject || body !== value.body;
  const save = (input: Parameters<typeof saveTemplateAction>[0]) =>
    startTransition(async () => {
      const r = await saveTemplateAction(input);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{def.description}</p>
        <Field>
          <FieldLabel htmlFor="tpl-subject">Subject</FieldLabel>
          <Input id="tpl-subject" value={subject} disabled={!canManage} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tpl-body">Body</FieldLabel>
          <Textarea id="tpl-body" rows={12} value={body} disabled={!canManage} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs leading-5" />
          <FieldDescription>
            Placeholders:{" "}
            {def.variables.map((v) => (
              <code key={v} className="mr-1 rounded bg-muted px-1">{`{{${v}}}`}</code>
            ))}
          </FieldDescription>
        </Field>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !dirty} onClick={() => save({ template: templateKey, subject, body })}>
              {pending ? <Spinner /> : <Save />} Save template
            </Button>
            <Button size="sm" variant="ghost" disabled={pending || !value.customised} onClick={() => save({ template: templateKey, reset: true })}>
              <RotateCcw /> Reset to default
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
        <div className="overflow-hidden rounded-xl border">
          <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{preview.subject}</p>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[26rem] w-full bg-white" />
        </div>
      </div>
    </div>
  );
}
