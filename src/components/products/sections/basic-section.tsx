"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { createProductDraftAction } from "@/app/(admin)/products/actions";
import { TagInput } from "@/components/tag-input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, basicSchema, slugify, type BasicValues } from "@/lib/products/schema";
import { SectionFooter, useSectionSubmit, type SectionProps } from "./section-form";

interface Props extends Omit<SectionProps, "productId"> {
  productId: string | null;
  initial: BasicValues;
  categories: { id: string; name: string }[];
  /** Create mode: called with the new draft id. */
  onCreated?: (id: string) => void;
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`text-xs tabular ${value.length > max ? "text-destructive" : "text-muted-foreground"}`}>
      {value.length}/{max}
    </span>
  );
}

export function BasicSection(props: Props) {
  const { productId, initial, categories, readOnly, onCreated } = props;
  const form = useForm<BasicValues>({ resolver: zodResolver(basicSchema), defaultValues: initial });
  const [slugTouched, setSlugTouched] = useState(!!productId);
  const { errors } = form.formState;

  const saveExisting = useSectionSubmit(form, "basic", { ...props, productId: productId ?? "" });
  const createDraft = form.handleSubmit(async (values) => {
    const r = await createProductDraftAction(values);
    if (!r.ok) {
      for (const [path, message] of Object.entries(r.fieldErrors ?? {})) form.setError(path as keyof BasicValues, { message });
      toast.error(r.error);
      return;
    }
    toast.success("Draft created — your progress is saved from here on.");
    form.reset(values);
    onCreated?.(r.id);
  });

  const [title, shortDescription] = useWatch({ control: form.control, name: ["title", "shortDescription"] });

  return (
    <form onSubmit={productId ? saveExisting : createDraft} noValidate className="space-y-8">
      <fieldset disabled={readOnly} className="space-y-8">
        <FieldSet>
          <FieldLegend>Identity</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Product name</FieldLabel>
              <Input
                id="name"
                placeholder="e.g. QwikMart"
                aria-invalid={!!errors.name}
                {...form.register("name", {
                  onChange: (e) => !slugTouched && form.setValue("slug", slugify(e.target.value), { shouldDirty: true }),
                })}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="slug">Slug</FieldLabel>
              <Input
                id="slug"
                className="font-mono text-sm"
                aria-invalid={!!errors.slug}
                {...form.register("slug", { onChange: () => setSlugTouched(true) })}
              />
              <FieldDescription>Unique across all products. Used in URLs.</FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>
            <Field data-invalid={!!errors.categoryId}>
              <FieldLabel htmlFor="categoryId">Category</FieldLabel>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="categoryId" className="w-full" aria-invalid={!!errors.categoryId}>
                      <SelectValue placeholder={categories.length ? "Choose a category" : "Create a category first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.categoryId]} />
            </Field>
            <Field data-invalid={!!errors.productType}>
              <FieldLabel htmlFor="productType">Product type</FieldLabel>
              <Controller
                control={form.control}
                name="productType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="productType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {PRODUCT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={!!errors.title} className="md:col-span-2">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="title">Full title</FieldLabel>
                <Counter value={title} max={160} />
              </div>
              <Input id="title" placeholder="Marketplace-style title with key selling points" {...form.register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={!!errors.tagline} className="md:col-span-2">
              <FieldLabel htmlFor="tagline">Tagline</FieldLabel>
              <Input id="tagline" placeholder="One line that explains the product" {...form.register("tagline")} />
              <FieldError errors={[errors.tagline]} />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Descriptions</FieldLegend>
          <FieldGroup>
            <Field data-invalid={!!errors.shortDescription}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="shortDescription">Short description</FieldLabel>
                <Counter value={shortDescription} max={400} />
              </div>
              <Textarea id="shortDescription" rows={3} aria-invalid={!!errors.shortDescription} {...form.register("shortDescription")} />
              <FieldError errors={[errors.shortDescription]} />
            </Field>
            <Field data-invalid={!!errors.fullDescription}>
              <FieldLabel htmlFor="fullDescription">Full description</FieldLabel>
              <Textarea id="fullDescription" rows={9} {...form.register("fullDescription")} />
              <FieldDescription>Separate paragraphs with a blank line.</FieldDescription>
              <FieldError errors={[errors.fullDescription]} />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Release &amp; technology</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-3">
            <Field data-invalid={!!errors.version}>
              <FieldLabel htmlFor="version">Current version</FieldLabel>
              <Input id="version" className="font-mono text-sm" placeholder="1.0.0" {...form.register("version")} />
              <FieldError errors={[errors.version]} />
            </Field>
            <Field data-invalid={!!errors.releaseDate}>
              <FieldLabel htmlFor="releaseDate">Release date</FieldLabel>
              <Input id="releaseDate" type="date" {...form.register("releaseDate")} />
              <FieldError errors={[errors.releaseDate]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="platform">Platform</FieldLabel>
              <Input id="platform" placeholder="e.g. Flutter 3.x" {...form.register("platform")} />
            </Field>
            <TagField form={form} name="techStack" label="Technology stack" placeholder="Flutter, Next.js, Firebase…" readOnly={readOnly} />
            <TagField form={form} name="integrations" label="Integrations" placeholder="Razorpay, FCM…" readOnly={readOnly} />
            <TagField form={form} name="modules" label="Included apps & panels" placeholder="Customer App, Admin Panel…" readOnly={readOnly} />
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Links</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field data-invalid={!!errors.demoUrl}>
              <FieldLabel htmlFor="demoUrl">Demo URL</FieldLabel>
              <Input id="demoUrl" type="url" placeholder="https://" {...form.register("demoUrl")} />
              <FieldError errors={[errors.demoUrl]} />
            </Field>
            <Field data-invalid={!!errors.websiteUrl}>
              <FieldLabel htmlFor="websiteUrl">Product website URL</FieldLabel>
              <Input id="websiteUrl" type="url" placeholder="https://infidec.com/products/…" {...form.register("websiteUrl")} />
              <FieldError errors={[errors.websiteUrl]} />
            </Field>
          </FieldGroup>
        </FieldSet>
      </fieldset>

      <SectionFooter
        form={form as never}
        readOnly={readOnly}
        wizardStep={props.wizardStep ?? (productId ? undefined : 1)}
        submitLabel={productId ? props.submitLabel : "Create draft & continue"}
        footerStart={props.footerStart}
      />
    </form>
  );
}

function TagField({
  form,
  name,
  label,
  placeholder,
  readOnly,
}: {
  form: UseFormReturn<BasicValues>;
  name: "techStack" | "integrations" | "modules";
  label: string;
  placeholder: string;
  readOnly?: boolean;
}) {
  const error = form.formState.errors[name];
  return (
    <Field data-invalid={!!error} className="md:col-span-3">
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <TagInput id={name} value={field.value} onChange={field.onChange} placeholder={placeholder} disabled={readOnly} invalid={!!error} />
        )}
      />
      <FieldDescription>Press Enter or comma to add.</FieldDescription>
      <FieldError errors={[error as { message?: string } | undefined]} />
    </Field>
  );
}
