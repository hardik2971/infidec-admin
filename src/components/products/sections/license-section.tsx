"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, licenseSchema, type LicenseValues } from "@/lib/products/schema";
import { SectionFooter, useSectionSubmit, type SectionProps } from "./section-form";

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

/** Number input bound to a nullable number field. */
function MoneyInput({
  id,
  value,
  onChange,
  currency,
  invalid,
  placeholder,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  currency: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>{SYMBOL[currency] ?? currency}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        className="tabular"
        aria-invalid={invalid}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </InputGroup>
  );
}

export function LicenseSection(props: SectionProps & { initial: LicenseValues }) {
  const form = useForm<LicenseValues>({ resolver: zodResolver(licenseSchema), defaultValues: props.initial });
  const onSubmit = useSectionSubmit(form, "license", props);
  const { errors } = form.formState;
  const currency = useWatch({ control: form.control, name: "currency" });
  const extendedEnabled = useWatch({ control: form.control, name: "extendedEnabled" });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <fieldset disabled={props.readOnly} className="space-y-8">
        <FieldSet>
          <FieldLegend>Pricing</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={props.readOnly}>
                    <SelectTrigger id="currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={!!errors.regularPrice}>
              <FieldLabel htmlFor="regularPrice">Regular licence price</FieldLabel>
              <Controller
                control={form.control}
                name="regularPrice"
                render={({ field }) => (
                  <MoneyInput id="regularPrice" currency={currency} value={field.value} onChange={(v) => field.onChange(v ?? 0)} invalid={!!errors.regularPrice} />
                )}
              />
              <FieldError errors={[errors.regularPrice]} />
            </Field>
            <Field data-invalid={!!errors.compareAtPrice}>
              <FieldLabel htmlFor="compareAtPrice">Original price</FieldLabel>
              <Controller
                control={form.control}
                name="compareAtPrice"
                render={({ field }) => (
                  <MoneyInput id="compareAtPrice" currency={currency} value={field.value} onChange={field.onChange} invalid={!!errors.compareAtPrice} placeholder="Optional" />
                )}
              />
              <FieldDescription>Shown struck through, if set.</FieldDescription>
              <FieldError errors={[errors.compareAtPrice]} />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Licence types</FieldLegend>
          <FieldGroup className="gap-4">
            <Field orientation="horizontal" className="rounded-lg border p-4">
              <FieldContent>
                <FieldLabel>Regular licence</FieldLabel>
                <FieldDescription>Always offered. Lifetime validity, one domain, end product not sold.</FieldDescription>
              </FieldContent>
              <Switch checked disabled aria-label="Regular licence (always on)" />
            </Field>
            <div className="rounded-lg border p-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="extendedEnabled">Extended licence</FieldLabel>
                  <FieldDescription>For end products that are sold to customers.</FieldDescription>
                </FieldContent>
                <Controller
                  control={form.control}
                  name="extendedEnabled"
                  render={({ field }) => (
                    <Switch id="extendedEnabled" checked={field.value} onCheckedChange={field.onChange} disabled={props.readOnly} />
                  )}
                />
              </Field>
              {extendedEnabled && (
                <Field data-invalid={!!errors.extendedPrice} className="mt-4 max-w-xs">
                  <FieldLabel htmlFor="extendedPrice">Extended licence price</FieldLabel>
                  <Controller
                    control={form.control}
                    name="extendedPrice"
                    render={({ field }) => (
                      <MoneyInput id="extendedPrice" currency={currency} value={field.value} onChange={field.onChange} invalid={!!errors.extendedPrice} />
                    )}
                  />
                  <FieldError errors={[errors.extendedPrice]} />
                </Field>
              )}
            </div>
            <Field orientation="horizontal" className="rounded-lg border p-4">
              <FieldContent>
                <FieldLabel htmlFor="customLicenseEnabled">Custom licence</FieldLabel>
                <FieldDescription>Negotiated terms for direct sales only. Never issued for marketplace purchases.</FieldDescription>
              </FieldContent>
              <Controller
                control={form.control}
                name="customLicenseEnabled"
                render={({ field }) => (
                  <Switch id="customLicenseEnabled" checked={field.value} onCheckedChange={field.onChange} disabled={props.readOnly} />
                )}
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Support</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-3">
            <Field data-invalid={!!errors.supportDurationMonths}>
              <FieldLabel htmlFor="supportDurationMonths">Support duration</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="supportDurationMonths"
                  type="number"
                  min={0}
                  max={60}
                  className="tabular"
                  {...form.register("supportDurationMonths", { valueAsNumber: true })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>months</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={[errors.supportDurationMonths]} />
            </Field>
            <Field className="md:col-span-3">
              <FieldLabel htmlFor="licenseNotes">Licence notes</FieldLabel>
              <Textarea id="licenseNotes" rows={3} placeholder="Internal notes about licence terms for this product" {...form.register("licenseNotes")} />
            </Field>
          </FieldGroup>
        </FieldSet>
      </fieldset>
      <SectionFooter form={form as never} readOnly={props.readOnly} wizardStep={props.wizardStep} submitLabel={props.submitLabel} footerStart={props.footerStart} />
    </form>
  );
}
