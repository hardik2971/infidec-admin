"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { marketplaceSchema, type MarketplaceValues } from "@/lib/products/schema";
import { SectionFooter, useSectionSubmit, type SectionProps } from "./section-form";

const NONE = "__none__";

export function MarketplaceSection(
  props: SectionProps & { initial: MarketplaceValues; marketplaces: { id: string; name: string }[] },
) {
  const form = useForm<MarketplaceValues>({ resolver: zodResolver(marketplaceSchema), defaultValues: props.initial });
  const onSubmit = useSectionSubmit(form, "marketplace", props);
  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <fieldset disabled={props.readOnly} className="space-y-6">
        <div className="flex gap-2.5 rounded-lg border bg-muted/40 p-3.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Record where the product is sold. Marketplace submissions (CodeCanyon review status, checklists, resubmissions)
            are managed in Marketplace Listings, delivered with the Envato integration in Phase 5.
          </p>
        </div>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="marketplaceId">Primary marketplace</FieldLabel>
            <Controller
              control={form.control}
              name="marketplaceId"
              render={({ field }) => (
                <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)} disabled={props.readOnly}>
                  <SelectTrigger id="marketplaceId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not listed yet</SelectItem>
                    {props.marketplaces.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field data-invalid={!!errors.marketplaceItemId}>
            <FieldLabel htmlFor="marketplaceItemId">Marketplace item ID</FieldLabel>
            <Input id="marketplaceItemId" className="font-mono text-sm" placeholder="e.g. 51234567" {...form.register("marketplaceItemId")} />
            <FieldDescription>The item ID assigned by the marketplace after approval.</FieldDescription>
            <FieldError errors={[errors.marketplaceItemId]} />
          </Field>
          <Field data-invalid={!!errors.marketplaceUrl} className="md:col-span-2">
            <FieldLabel htmlFor="marketplaceUrl">Marketplace URL</FieldLabel>
            <Input id="marketplaceUrl" type="url" placeholder="https://codecanyon.net/item/…" {...form.register("marketplaceUrl")} />
            <FieldError errors={[errors.marketplaceUrl]} />
          </Field>
        </FieldGroup>
      </fieldset>
      <SectionFooter form={form as never} readOnly={props.readOnly} wizardStep={props.wizardStep} submitLabel={props.submitLabel} footerStart={props.footerStart} />
    </form>
  );
}
