"use client";

import { Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRefundAction, transitionRefundAction } from "@/app/(admin)/refunds/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMoney } from "@/lib/format";
import { NEXT_STATUSES, REFUND_STATUS_LABELS, type RefundRecord, type RefundStatus } from "@/lib/refunds/schema";
import { marketplaceLabel } from "@/lib/sales/schema";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<RefundStatus, string> = {
  requested: "border-warning/40 text-warning",
  under_review: "border-chart-2/40 text-chart-2",
  approved: "border-primary/40 text-primary",
  rejected: "border-destructive/40 text-destructive",
  completed: "border-success/40 text-success",
};

export interface RefundableOrder {
  id: string;
  label: string;
  max: number; // major units
  currency: string;
}

export function RefundsBoard({
  refunds,
  names,
  orders,
  canCreate,
  canEdit,
  canApprove,
}: {
  refunds: RefundRecord[];
  names: { customers: Record<string, string>; products: Record<string, string> };
  orders: RefundableOrder[];
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const [channel, setChannel] = useState<"all" | "marketplace" | "direct">("all");
  const [newOpen, setNewOpen] = useState(false);
  const [acting, setActing] = useState<{ refund: RefundRecord; status: RefundStatus } | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const rows = channel === "all" ? refunds : refunds.filter((r) => r.channel === channel);
  const canDo = (s: RefundStatus) => (s === "approved" || s === "rejected" ? canApprove : canEdit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border bg-card p-0.5">
          {(
            [
              ["all", "All"],
              ["marketplace", "Marketplace"],
              ["direct", "Direct (gateway)"],
            ] as const
          ).map(([k, l]) => (
            <Button key={k} size="sm" variant={channel === k ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setChannel(k)}>
              {l} <span className="tabular opacity-70">{k === "all" ? refunds.length : refunds.filter((r) => r.channel === k).length}</span>
            </Button>
          ))}
        </div>
        {canCreate && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus /> New refund request
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RotateCcw />
            </EmptyMedia>
            <EmptyTitle>Nothing here</EmptyTitle>
            <EmptyDescription>Refund requests are tracked here from request to completion.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="gap-0 py-0">
              <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_16rem]">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{r.number}</span>
                    <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                      {REFUND_STATUS_LABELS[r.status]}
                    </Badge>
                    <Badge variant="secondary">{r.channel === "marketplace" ? marketplaceLabel(r.marketplace) : "Direct payment"}</Badge>
                    <span className="ml-auto font-semibold tabular">{formatMoney(r.amount, r.currency)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <Link href={`/customers/${r.customerId}`} className="hover:text-primary">
                      {names.customers[r.customerId] ?? "Customer"}
                    </Link>{" "}
                    · {names.products[r.productId] ?? "Product"} · order <span className="font-mono">{r.orderNumber}</span>
                  </p>
                  <p className="text-sm">{r.reason}</p>
                  <ol className="mt-1 space-y-1 border-l pl-3">
                    {r.history.map((h, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{REFUND_STATUS_LABELS[h.status]}</span> · {formatDateTime(h.at)} · {h.byEmail}
                        {h.note && h.status !== "requested" && <span> — {h.note}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex flex-col gap-2 lg:items-stretch">
                  {NEXT_STATUSES[r.status].filter(canDo).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "rejected" ? "outline" : s === "completed" ? "default" : "secondary"}
                      className={cn(s === "rejected" && "text-destructive")}
                      onClick={() => {
                        setNote("");
                        setActing({ refund: r, status: s });
                      }}
                    >
                      {s === "completed" ? "Mark completed" : `Mark ${REFUND_STATUS_LABELS[s].toLowerCase()}`}
                    </Button>
                  ))}
                  {r.status === "approved" && (
                    <p className="text-xs text-muted-foreground">
                      {r.channel === "marketplace"
                        ? "Envato processes marketplace refunds — mark completed once Envato confirms it."
                        : "Issue the refund in your payment gateway, then mark it completed here."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!acting} onOpenChange={(o) => !o && setActing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acting && `${REFUND_STATUS_LABELS[acting.status]}: ${acting.refund.number}`}
            </DialogTitle>
            <DialogDescription>
              {acting?.status === "completed"
                ? "The order is marked refunded (or partially refunded). A full refund also marks the license refunded."
                : "Add a note for the refund history."}
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. gateway refund ID, Envato confirmation)" aria-label="Note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActing(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                acting &&
                startTransition(async () => {
                  const r = await transitionRefundAction({ id: acting.refund.id, status: acting.status, note });
                  if (r.ok) {
                    toast.success(r.message);
                    setActing(null);
                  } else toast.error(r.error);
                })
              }
            >
              {pending && <Spinner />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewRefundDialog open={newOpen} onOpenChange={setNewOpen} orders={orders} />
    </div>
  );
}

function NewRefundDialog({ open, onOpenChange, orders }: { open: boolean; onOpenChange: (o: boolean) => void; orders: RefundableOrder[] }) {
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const order = orders.find((o) => o.id === orderId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New refund request</DialogTitle>
          <DialogDescription>Records a refund request for review. No money moves from the admin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="rf-order">Order</FieldLabel>
            <Select
              value={orderId}
              onValueChange={(v) => {
                setOrderId(v);
                const o = orders.find((x) => x.id === v);
                if (o) setAmount(String(o.max));
              }}
            >
              <SelectTrigger id="rf-order" className="w-full">
                <SelectValue placeholder={orders.length ? "Choose a completed order" : "No refundable orders"} />
              </SelectTrigger>
              <SelectContent>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="rf-amount">Amount{order ? ` (${order.currency})` : ""}</FieldLabel>
            <Input id="rf-amount" type="number" min={0} step="0.01" className="max-w-48 tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {order && <FieldDescription>Up to {order.max.toFixed(2)} — the full amount refunds the order and its license.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="rf-reason">Reason</FieldLabel>
            <Textarea id="rf-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !orderId || !reason.trim() || !(Number(amount) > 0)}
            onClick={() =>
              startTransition(async () => {
                const r = await createRefundAction({ orderId, amount: Number(amount), reason });
                if (r.ok) {
                  toast.success(r.message);
                  onOpenChange(false);
                  setOrderId("");
                  setReason("");
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Spinner />} Record request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
