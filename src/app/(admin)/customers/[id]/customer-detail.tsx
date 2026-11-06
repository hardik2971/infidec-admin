"use client";

import { ArrowLeft, Ban, Mail, Pencil, Phone, RotateCcw, StickyNote } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { initials } from "@/components/layout/user-menu";
import { CustomerDialog } from "@/components/sales/customer-dialog";
import { LicensesTable } from "@/components/sales/licenses-table";
import { OrderDialog } from "@/components/sales/order-dialog";
import { OrdersTable } from "@/components/sales/orders-table";
import { PriorityBadge, TicketStatusBadge } from "@/components/support/ticket-badges";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { DownloadLog } from "@/lib/downloads/service";
import { formatDateTime } from "@/lib/format";
import type { CustomerNote } from "@/lib/sales/service";
import type { CustomerRecord, LicenseRecord, OrderRecord } from "@/lib/sales/schema";
import type { TicketRecord } from "@/lib/support/schema";
import { addCustomerNoteAction, setCustomerStatusAction } from "../actions";

export function CustomerDetail({
  customer,
  orders,
  licenses,
  notes,
  downloads,
  tickets,
  products,
  caps,
}: {
  customer: CustomerRecord;
  orders: OrderRecord[];
  licenses: LicenseRecord[];
  notes: CustomerNote[];
  downloads: DownloadLog[];
  tickets: TicketRecord[];
  products: { id: string; name: string; currency: string; archived: boolean }[];
  caps: { edit: boolean; createOrder: boolean; editOrders: boolean; editLicenses: boolean };
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const self = { [customer.id]: customer.name };

  return (
    <div className="space-y-6">
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar className="size-14 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-brand-gradient text-lg font-semibold text-white">{initials(customer.name)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {customer.name}
              {customer.status === "suspended" && <Badge variant="outline" className="border-destructive/40 text-destructive">Suspended</Badge>}
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="size-3.5" /> {customer.email}
              </a>
              {customer.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" /> {customer.phone}
                </span>
              )}
              {customer.company && <span>{customer.company}</span>}
              {customer.country && <span>{customer.country}</span>}
              {customer.marketplaceUsername && <span>Envato: {customer.marketplaceUsername}</span>}
            </p>
            <p className="text-xs text-muted-foreground">Customer since {formatDateTime(customer.createdAt).split(",")[0]}</p>
          </div>
        </div>
        {caps.edit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await setCustomerStatusAction({ id: customer.id, status: customer.status === "active" ? "suspended" : "active" });
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.error);
                })
              }
            >
              {customer.status === "active" ? <Ban /> : <RotateCcw />} {customer.status === "active" ? "Suspend" : "Reactivate"}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchases ({orders.length})</TabsTrigger>
          <TabsTrigger value="licenses">Licenses ({licenses.length})</TabsTrigger>
          <TabsTrigger value="downloads">Downloads ({downloads.length})</TabsTrigger>
          <TabsTrigger value="support">Support ({tickets.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="mt-4">
          <OrdersTable
            orders={orders}
            customerNames={self}
            productNames={productNames}
            canEdit={caps.editOrders}
            showCustomer={false}
            toolbar={
              caps.createOrder ? (
                <OrderDialog
                  customers={[{ id: customer.id, name: customer.name, email: customer.email }]}
                  products={products.filter((p) => !p.archived)}
                  defaultCustomerId={customer.id}
                />
              ) : null
            }
          />
        </TabsContent>
        <TabsContent value="licenses" className="mt-4">
          <LicensesTable licenses={licenses} customerNames={self} productNames={productNames} canEdit={caps.editLicenses} showCustomer={false} />
        </TabsContent>
        <TabsContent value="downloads" className="mt-4">
          <Card className="gap-0 divide-y p-0">
            {downloads.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No downloads yet.</p>}
            {downloads.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Badge variant="outline" className={d.result === "authorized" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}>
                  {d.result === "authorized" ? "Authorized" : "Denied"}
                </Badge>
                <span className="flex-1">
                  {d.fileName ?? d.packageId} {d.version && <span className="font-mono text-xs text-muted-foreground">v{d.version}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{d.issuedBy === "customer" ? "Customer" : (d.issuedByEmail ?? "Staff")}</span>
                <span className="text-xs text-muted-foreground tabular">{formatDateTime(d.createdAt)}</span>
              </div>
            ))}
          </Card>
        </TabsContent>
        <TabsContent value="support" className="mt-4">
          <Card className="gap-0 divide-y p-0">
            {tickets.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No support tickets.</p>}
            {tickets.map((t) => (
              <Link key={t.id} href={`/support/${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                <span className="font-mono text-xs text-muted-foreground">{t.number}</span>
                <span className="flex-1 font-medium">{t.subject}</span>
                <span className="text-xs text-muted-foreground">{productNames[t.productId]}</span>
                <PriorityBadge priority={t.priority} />
                <TicketStatusBadge status={t.status} />
              </Link>
            ))}
          </Card>
        </TabsContent>
        <TabsContent value="notes" className="mt-4 space-y-4">
          {caps.edit && (
            <Card className="gap-0 py-0">
              <CardContent className="space-y-2 p-4">
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note — visible to staff only" aria-label="Internal note" />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={pending || !note.trim()}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await addCustomerNoteAction({ id: customer.id, body: note });
                        if (r.ok) {
                          toast.success(r.message);
                          setNote("");
                        } else toast.error(r.error);
                      })
                    }
                  >
                    {pending ? <Spinner /> : <StickyNote />} Add note
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {notes.map((n) => (
            <Card key={n.id} className="gap-1 py-4">
              <CardContent className="space-y-1 px-4">
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {n.authorEmail} · {formatDateTime(n.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
          {!notes.length && !caps.edit && <p className="text-sm text-muted-foreground">No notes.</p>}
        </TabsContent>
      </Tabs>

      <CustomerDialog open={editing} onOpenChange={setEditing} customer={customer} />
    </div>
  );
}
