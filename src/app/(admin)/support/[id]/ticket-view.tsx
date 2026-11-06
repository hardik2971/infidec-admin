"use client";

import { ArrowLeft, Lock, Paperclip, RefreshCw, Send, ShieldAlert, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { initials } from "@/components/layout/user-menu";
import { PriorityBadge, TicketStatusBadge } from "@/components/support/ticket-badges";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDateTime } from "@/lib/format";
import { PRIORITIES, TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketMessage, type TicketRecord } from "@/lib/support/schema";
import { cn } from "@/lib/utils";
import { recheckEntitlementAction, updateTicketAction } from "../actions";

const UNASSIGNED = "__none__";

export function TicketView({
  ticket,
  messages,
  customer,
  productName,
  categories,
  staff,
  canEdit,
}: {
  ticket: TicketRecord;
  messages: TicketMessage[];
  customer: { id: string; name: string; email: string } | null;
  productName: string;
  categories: string[];
  staff: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const closed = ticket.status === "closed";

  const patch = (p: Parameters<typeof updateTicketAction>[0]) =>
    startTransition(async () => {
      const r = await updateTicketAction(p);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  async function send() {
    setSending(true);
    const form = new FormData();
    form.append("body", body);
    form.append("internal", String(internal));
    files.forEach((f) => form.append("files", f));
    const r = await fetch(`/api/tickets/${ticket.id}/messages`, { method: "POST", body: form }).then(
      (x) => x.json() as Promise<{ ok: boolean; error?: string; emailStatus?: string | null; emailError?: string | null }>,
    );
    setSending(false);
    if (r.ok) {
      if (internal) toast.success("Internal note added.");
      else if (r.emailStatus === "sent") toast.success("Reply sent and emailed to the customer.");
      else if (r.emailStatus === "failed") toast.warning("Reply saved, but the email failed.", { description: r.emailError ?? undefined });
      else toast.success("Reply recorded (email notifications for replies are switched off).");
      setBody("");
      setFiles([]);
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-5">
      <Link href="/support" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Support tickets
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{ticket.number}</span> · {productName} · opened {formatDateTime(ticket.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <TicketStatusBadge status={ticket.status} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <ol className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex gap-3", m.authorType === "staff" && "flex-row-reverse")}>
                <Avatar className="size-8 shrink-0 rounded-lg">
                  <AvatarFallback className={cn("rounded-lg text-xs font-semibold", m.authorType === "staff" ? "bg-brand-gradient text-white" : "bg-muted")}>
                    {initials(m.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl border px-4 py-3",
                    m.internal ? "border-dashed border-warning/50 bg-warning/5" : m.authorType === "staff" ? "border-primary/20 bg-accent/60" : "bg-card",
                  )}
                >
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.authorName}</span>
                    {m.internal && (
                      <Badge variant="outline" className="gap-1 border-warning/40 text-[10px] text-warning">
                        <Lock className="size-2.5" /> Internal note
                      </Badge>
                    )}
                    {formatDateTime(m.createdAt)}
                    {m.authorType === "staff" && !m.internal && m.emailStatus === "sent" && <span className="text-success">· Emailed</span>}
                    {m.authorType === "staff" && !m.internal && m.emailStatus === "failed" && <span className="text-destructive">· Email failed</span>}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  {m.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {m.attachments.map((a) => (
                        <li key={a.storagePath}>
                          <a
                            href={`/api/tickets/${ticket.id}/attachment?path=${encodeURIComponent(a.storagePath)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <Paperclip className="size-3" /> {a.name} ({formatBytes(a.size)})
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {canEdit && !closed && (
            <Card className={cn("gap-0 py-0", internal && "border-dashed border-warning/50")}>
              <CardContent className="space-y-3 p-4">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder={internal ? "Internal note — only staff can see this" : `Reply to ${customer?.name ?? "the customer"}…`}
                  aria-label="Message"
                />
                {files.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {files.map((f) => (
                      <li key={f.name} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                        {f.name}
                        <button type="button" onClick={() => setFiles((x) => x.filter((y) => y !== f))} aria-label={`Remove ${f.name}`}>
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Button type="button" size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={files.length >= 5}>
                      <Paperclip /> Attach
                    </Button>
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,application/pdf,application/zip,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        // Copy first: the FileList is live and clearing the input empties it.
                        const picked = [...(e.target.files ?? [])];
                        e.target.value = "";
                        setFiles((x) => [...x, ...picked].slice(0, 5));
                      }}
                    />
                    <Label className="flex items-center gap-2 text-sm font-normal">
                      <Switch checked={internal} onCheckedChange={setInternal} /> Internal note
                    </Label>
                  </div>
                  <Button size="sm" onClick={send} disabled={sending || !body.trim()}>
                    {sending ? <Spinner /> : internal ? <Lock /> : <Send />} {internal ? "Add note" : "Send reply"}
                  </Button>
                </div>
                {!internal && <p className="text-xs text-muted-foreground">Replies are saved on the ticket and emailed to the customer.</p>}
              </CardContent>
            </Card>
          )}
          {closed && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">This ticket is closed. Change its status to reply again.</p>}
        </div>

        <div className="space-y-4">
          <Card className={ticket.entitlement?.supported ? "border-success/30" : "border-warning/30"}>
            <CardContent className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                {ticket.entitlement?.supported ? <ShieldCheck className="size-4 text-success" /> : <ShieldAlert className="size-4 text-warning" />}
                {ticket.entitlement?.supported ? "Support entitlement active" : "No active support"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ticket.entitlement?.supportExpiry
                  ? `Support ${ticket.entitlement.supported ? "until" : "ended"} ${formatDateTime(ticket.entitlement.supportExpiry).split(",")[0]}.`
                  : "No license with support was found for this product."}{" "}
                Checked {formatDateTime(ticket.entitlement?.checkedAt)}.
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await recheckEntitlementAction(ticket.id);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  })
                }
              >
                <RefreshCw /> Re-check
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Customer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {customer ? (
                <Link href={`/customers/${customer.id}`} className="block hover:text-primary">
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-xs text-muted-foreground">{customer.email}</p>
                </Link>
              ) : (
                "—"
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              {(
                [
                  ["Status", ticket.status, TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] })), (v: string) => patch({ id: ticket.id, status: v as TicketRecord["status"] })],
                  ["Priority", ticket.priority, PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })), (v: string) => patch({ id: ticket.id, priority: v as TicketRecord["priority"] })],
                  ["Category", ticket.category, categories.map((c) => ({ value: c, label: c })), (v: string) => patch({ id: ticket.id, category: v })],
                  [
                    "Assignee",
                    ticket.assignedTo ?? UNASSIGNED,
                    [{ value: UNASSIGNED, label: "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.name }))],
                    (v: string) => patch({ id: ticket.id, assignedTo: v === UNASSIGNED ? null : v }),
                  ],
                ] as const
              ).map(([label, value, items, onChange]) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Select value={value} onValueChange={onChange} disabled={!canEdit || pending}>
                    <SelectTrigger className="w-full" aria-label={label}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
