"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createOrderAction } from "@/app/(admin)/customers/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { LICENSE_TYPES, LICENSE_TYPE_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_STATUSES, orderSchema, type OrderValues } from "@/lib/sales/schema";

function NumberInput({ value, onChange, id, invalid }: { value: number | null; onChange: (v: number | null) => void; id: string; invalid?: boolean }) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step="0.01"
      className="tabular"
      aria-invalid={invalid}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

export function OrderDialog({
  customers,
  products,
  defaultCustomerId,
}: {
  customers: { id: string; name: string; email: string }[];
  products: { id: string; name: string; currency: string }[];
  defaultCustomerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: defaultCustomerId ?? "",
      productId: "",
      channel: "direct",
      marketplace: "infidec",
      transactionRef: "",
      licenseType: "regular",
      purchaseDate: today,
      currency: "INR",
      grossAmount: 0,
      authorEarnings: null,
      status: "completed",
      paymentStatus: "paid",
      notes: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const channel = useWatch({ control: form.control, name: "channel" });

  const onSubmit = form.handleSubmit(async (values) => {
    const r = await createOrderAction(values);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    form.reset();
    setOpen(false);
  });

  const select = <K extends keyof OrderValues>(name: K, items: { value: string; label: string }[], id: string, placeholder?: string, onPick?: (v: string) => void) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select
          value={String(field.value ?? "")}
          onValueChange={(v) => {
            field.onChange(v);
            onPick?.(v);
          }}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={!!errors[name]}>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Record order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record an order</DialogTitle>
          <DialogDescription>
            Direct website sales get an INFIDEC license automatically when completed. CodeCanyon purchases should be recorded through Verify Purchase Code.
          </DialogDescription>
        </DialogHeader>
        <form id="order-form" onSubmit={onSubmit} noValidate className="max-h-[65vh] overflow-y-auto pr-1">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.customerId}>
              <FieldLabel htmlFor="o-customer">Customer</FieldLabel>
              {select("customerId", customers.map((c) => ({ value: c.id, label: `${c.name} · ${c.email}` })), "o-customer", customers.length ? "Choose a customer" : "Create a customer first")}
              <FieldError errors={[errors.customerId]} />
            </Field>
            <Field data-invalid={!!errors.productId}>
              <FieldLabel htmlFor="o-product">Product</FieldLabel>
              {select("productId", products.map((p) => ({ value: p.id, label: p.name })), "o-product", "Choose a product", (v) => {
                const p = products.find((x) => x.id === v);
                if (p && (p.currency === "INR" || p.currency === "USD")) form.setValue("currency", p.currency);
              })}
              <FieldError errors={[errors.productId]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="o-channel">Sales channel</FieldLabel>
              {select("channel", [{ value: "direct", label: "Direct (INFIDEC website)" }, { value: "marketplace", label: "Marketplace" }], "o-channel", undefined, (v) => {
                form.setValue("marketplace", v === "direct" ? "infidec" : "envato");
                form.setValue("currency", v === "direct" ? "INR" : "USD");
              })}
            </Field>
            <Field>
              <FieldLabel htmlFor="o-license">License type</FieldLabel>
              {select("licenseType", LICENSE_TYPES.filter((t) => channel === "direct" || t !== "custom").map((t) => ({ value: t, label: LICENSE_TYPE_LABELS[t] })), "o-license")}
            </Field>
            {channel === "marketplace" && (
              <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs sm:col-span-2">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                Manually recorded marketplace orders stay <strong className="font-medium">unverified</strong> and get no license. Use Verify Purchase Code for CodeCanyon sales.
              </div>
            )}
            <Field data-invalid={!!errors.purchaseDate}>
              <FieldLabel htmlFor="o-date">Purchase date</FieldLabel>
              <Input id="o-date" type="date" max={today} {...form.register("purchaseDate")} />
              <FieldError errors={[errors.purchaseDate]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="o-ref">Transaction reference</FieldLabel>
              <Input id="o-ref" placeholder="Gateway payment ID / invoice no." {...form.register("transactionRef")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="o-currency">Currency</FieldLabel>
              {select("currency", [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }], "o-currency")}
            </Field>
            <Field data-invalid={!!errors.grossAmount}>
              <FieldLabel htmlFor="o-gross">Gross amount</FieldLabel>
              <Controller control={form.control} name="grossAmount" render={({ field }) => <NumberInput id="o-gross" value={field.value} onChange={(v) => field.onChange(v ?? 0)} invalid={!!errors.grossAmount} />} />
              <FieldError errors={[errors.grossAmount]} />
            </Field>
            {channel === "marketplace" && (
              <Field data-invalid={!!errors.authorEarnings}>
                <FieldLabel htmlFor="o-earn">Author earnings</FieldLabel>
                <Controller control={form.control} name="authorEarnings" render={({ field }) => <NumberInput id="o-earn" value={field.value} onChange={field.onChange} invalid={!!errors.authorEarnings} />} />
                <FieldDescription>From your marketplace statement. Leave empty if unknown.</FieldDescription>
                <FieldError errors={[errors.authorEarnings]} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="o-status">Order status</FieldLabel>
              {select("status", ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] })), "o-status")}
            </Field>
            <Field>
              <FieldLabel htmlFor="o-pay">Payment status</FieldLabel>
              {select("paymentStatus", PAYMENT_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), "o-pay")}
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="o-notes">Notes</FieldLabel>
              <Textarea id="o-notes" rows={2} {...form.register("notes")} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="order-form" disabled={isSubmitting}>
            {isSubmitting && <Spinner />} Record order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
