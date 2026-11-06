"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveCustomerAction } from "@/app/(admin)/customers/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { customerSchema, type CustomerRecord, type CustomerValues } from "@/lib/sales/schema";

export function CustomerDialog({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: CustomerRecord | null }) {
  const router = useRouter();
  const form = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    values: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      country: customer?.country ?? "",
      company: customer?.company ?? "",
      marketplaceUsername: customer?.marketplaceUsername ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const r = await saveCustomerAction({ id: customer?.id, values });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onOpenChange(false);
    if (!customer) router.push(`/customers/${r.id}`);
  });

  const text = (name: keyof CustomerValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`c-${name}`}>{label}</FieldLabel>
      <Input id={`c-${name}`} aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Customers who verify a purchase code are created automatically.</DialogDescription>
        </DialogHeader>
        <form id="customer-form" onSubmit={onSubmit} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {text("name", "Full name")}
            {text("email", "Email", { type: "email" })}
            {text("phone", "Phone")}
            {text("country", "Country")}
            {text("company", "Company")}
            {text("marketplaceUsername", "Envato username")}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" disabled={isSubmitting}>
            {isSubmitting && <Spinner />} {customer ? "Save" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
