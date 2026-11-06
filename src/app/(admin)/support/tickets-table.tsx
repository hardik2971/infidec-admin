"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PriorityBadge, TicketStatusBadge } from "@/components/support/ticket-badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { PRIORITIES, TICKET_STATUS_LABELS, ticketSchema, type TicketRecord, type TicketStatus, type TicketValues } from "@/lib/support/schema";
import { createTicketAction } from "./actions";

type Filter = "active" | "mine" | TicketStatus | "all";

export function TicketsTable({
  tickets,
  customers,
  products,
  categories,
  currentUid,
  canCreate,
}: {
  tickets: TicketRecord[];
  customers: { id: string; name: string; email: string }[];
  products: { id: string; name: string }[];
  categories: string[];
  currentUid: string;
  canCreate: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("active");
  const [open, setOpen] = useState(false);
  const cust = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const prod = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);
  const isActive = (t: TicketRecord) => t.status !== "resolved" && t.status !== "closed";
  const rows = tickets.filter((t) =>
    filter === "all" ? true : filter === "active" ? isActive(t) : filter === "mine" ? t.assignedTo === currentUid && isActive(t) : t.status === filter,
  );

  const columns = useMemo<DataTableColumn<TicketRecord>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Ticket",
        cell: ({ row }) => {
          const t = row.original;
          return (
            <Link href={`/support/${t.id}`} className="group block min-w-0">
              <p className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                {t.lastMessageBy === "customer" && isActive(t) && <span className="size-2 rounded-full bg-primary" aria-label="Awaiting staff reply" />}
                <span className="truncate">{t.subject}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{t.number}</span> · {t.category} · {cust[t.customerId] ?? "—"}
              </p>
            </Link>
          );
        },
      },
      { accessorKey: "productId", header: "Product", cell: ({ row }) => <span className="text-sm">{prod[row.original.productId] ?? "—"}</span> },
      {
        accessorKey: "entitlement",
        header: "Support",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.entitlement?.supported ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldCheck className="size-4 text-success" aria-label="Supported" />
              </TooltipTrigger>
              <TooltipContent>Support active until {formatDateTime(row.original.entitlement.supportExpiry).split(",")[0]}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldAlert className="size-4 text-warning" aria-label="Not supported" />
              </TooltipTrigger>
              <TooltipContent>No active support entitlement</TooltipContent>
            </Tooltip>
          ),
      },
      { accessorKey: "priority", header: "Priority", cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <TicketStatusBadge status={row.original.status} /> },
      { accessorKey: "assignedToName", header: "Assignee", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.assignedToName ?? "Unassigned"}</span> },
      { accessorKey: "lastMessageAt", header: "Last activity", cell: ({ row }) => <span className="text-xs text-muted-foreground tabular">{formatDateTime(row.original.lastMessageAt ?? row.original.createdAt)}</span> },
    ],
    [cust, prod],
  );

  const tabs: [Filter, string][] = [
    ["active", "Active"],
    ["mine", "Assigned to me"],
    ["open", TICKET_STATUS_LABELS.open],
    ["waiting_customer", "Waiting"],
    ["resolved", "Resolved"],
    ["all", "All"],
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchText={(t) => `${t.number} ${t.subject} ${t.category} ${cust[t.customerId] ?? ""} ${prod[t.productId] ?? ""}`}
        searchPlaceholder="Search tickets…"
        emptyTitle="No tickets here"
        emptyDescription="Tickets opened by customers or staff appear here."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-lg border bg-card p-0.5">
              {tabs.map(([key, label]) => (
                <Button key={key} size="sm" variant={filter === key ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setFilter(key)}>
                  {label}
                </Button>
              ))}
            </div>
            {canCreate && (
              <Button onClick={() => setOpen(true)}>
                <MessageSquarePlus /> New ticket
              </Button>
            )}
          </div>
        }
      />
      <NewTicketDialog open={open} onOpenChange={setOpen} customers={customers} products={products} categories={categories} />
    </>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
  customers,
  products,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: { id: string; name: string; email: string }[];
  products: { id: string; name: string }[];
  categories: string[];
}) {
  const router = useRouter();
  const form = useForm<TicketValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { customerId: "", productId: "", subject: "", category: categories[0] ?? "General Inquiry", priority: "normal", body: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const select = (name: "customerId" | "productId" | "category" | "priority", items: { value: string; label: string }[], placeholder?: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={`t-${name}`} className="w-full" aria-invalid={!!errors[name]}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>Open a ticket on a customer&apos;s behalf, e.g. from an email. Their support entitlement is checked automatically.</DialogDescription>
        </DialogHeader>
        <form
          id="ticket-form"
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            const r = await createTicketAction(values);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success(r.message);
            onOpenChange(false);
            router.push(`/support/${r.id}`);
          })}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.customerId}>
              <FieldLabel htmlFor="t-customerId">Customer</FieldLabel>
              {select("customerId", customers.map((c) => ({ value: c.id, label: `${c.name} · ${c.email}` })), "Choose a customer")}
              <FieldError errors={[errors.customerId]} />
            </Field>
            <Field data-invalid={!!errors.productId}>
              <FieldLabel htmlFor="t-productId">Product</FieldLabel>
              {select("productId", products.map((p) => ({ value: p.id, label: p.name })), "Choose a product")}
              <FieldError errors={[errors.productId]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="t-category">Category</FieldLabel>
              {select("category", categories.map((c) => ({ value: c, label: c })))}
            </Field>
            <Field>
              <FieldLabel htmlFor="t-priority">Priority</FieldLabel>
              {select("priority", PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })))}
            </Field>
            <Field data-invalid={!!errors.subject} className="sm:col-span-2">
              <FieldLabel htmlFor="t-subject">Subject</FieldLabel>
              <Input id="t-subject" {...form.register("subject")} />
              <FieldError errors={[errors.subject]} />
            </Field>
            <Field data-invalid={!!errors.body} className="sm:col-span-2">
              <FieldLabel htmlFor="t-body">Customer&apos;s message</FieldLabel>
              <Textarea id="t-body" rows={5} {...form.register("body")} />
              <FieldError errors={[errors.body]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="ticket-form" disabled={isSubmitting}>
            {isSubmitting && <Spinner />} Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
