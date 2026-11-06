"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { TagInput } from "@/components/tag-input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { seoSchema, type SeoValues } from "@/lib/products/schema";
import { SectionFooter, useSectionSubmit, type SectionProps } from "./section-form";

function Meter({ value, ideal, max }: { value: string; ideal: number; max: number }) {
  const n = value.length;
  const tone = n === 0 ? "text-muted-foreground" : n > max ? "text-destructive" : n > ideal ? "text-warning" : "text-success";
  return <span className={`text-xs tabular ${tone}`}>{n}/{ideal}</span>;
}

export function SeoSection(props: SectionProps & { initial: SeoValues; fallbackTitle: string; fallbackDescription: string; url: string }) {
  const form = useForm<SeoValues>({ resolver: zodResolver(seoSchema), defaultValues: props.initial });
  const onSubmit = useSectionSubmit(form, "seo", props);
  const { errors } = form.formState;
  const [title, description, canonical] = useWatch({ control: form.control, name: ["seoTitle", "seoDescription", "canonicalUrl"] });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <fieldset disabled={props.readOnly}>
          <FieldGroup>
            <Field data-invalid={!!errors.seoTitle}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="seoTitle">SEO title</FieldLabel>
                <Meter value={title} ideal={60} max={70} />
              </div>
              <Input id="seoTitle" placeholder={props.fallbackTitle} {...form.register("seoTitle")} />
              <FieldError errors={[errors.seoTitle]} />
            </Field>
            <Field data-invalid={!!errors.seoDescription}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="seoDescription">Meta description</FieldLabel>
                <Meter value={description} ideal={160} max={170} />
              </div>
              <Textarea id="seoDescription" rows={4} {...form.register("seoDescription")} />
              <FieldError errors={[errors.seoDescription]} />
            </Field>
            <Field data-invalid={!!errors.seoKeywords}>
              <FieldLabel htmlFor="seoKeywords">Keywords</FieldLabel>
              <Controller
                control={form.control}
                name="seoKeywords"
                render={({ field }) => (
                  <TagInput id="seoKeywords" value={field.value} onChange={field.onChange} max={20} placeholder="grocery app source code…" disabled={props.readOnly} />
                )}
              />
              <FieldError errors={[errors.seoKeywords as { message?: string } | undefined]} />
            </Field>
            <Field data-invalid={!!errors.canonicalUrl}>
              <FieldLabel htmlFor="canonicalUrl">Canonical URL</FieldLabel>
              <Input id="canonicalUrl" type="url" placeholder={props.url || "https://infidec.com/products/…"} {...form.register("canonicalUrl")} />
              <FieldDescription>The public product page search engines should index.</FieldDescription>
              <FieldError errors={[errors.canonicalUrl]} />
            </Field>
          </FieldGroup>
        </fieldset>

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Search result preview</p>
          <div className="rounded-xl border bg-card p-4 shadow-xs">
            <p className="truncate text-xs text-muted-foreground">{(canonical || props.url || "https://infidec.com/products").replace(/^https?:\/\//, "")}</p>
            <p className="mt-1 line-clamp-1 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{title || props.fallbackTitle || "Product title"}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {description || props.fallbackDescription || "The meta description appears here."}
            </p>
          </div>
        </div>
      </div>
      <SectionFooter form={form as never} readOnly={props.readOnly} wizardStep={props.wizardStep} submitLabel={props.submitLabel} footerStart={props.footerStart} />
    </form>
  );
}
