"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { createVersionAction, updateVersionAction } from "@/app/(admin)/versions/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { versionSchema, type VersionRecord, type VersionValues } from "@/lib/packages/schema";

/** Textarea bound to a string[] — one entry per line. */
function LinesField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={4}
        disabled={disabled}
        defaultValue={value.join("\n")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((l) => l.replace(/^[-*•]\s*/, "").trim())
              .filter(Boolean),
          )
        }
        placeholder={hint}
      />
      <FieldDescription>One per line.</FieldDescription>
    </Field>
  );
}

export function versionDefaults(v?: VersionRecord | null, suggested = "1.0.0"): VersionValues {
  return {
    version: v?.version ?? suggested,
    releaseDate: v?.releaseDate ?? "",
    title: v?.title ?? "",
    releaseNotes: v?.releaseNotes ?? "",
    newFeatures: v?.newFeatures ?? [],
    improvements: v?.improvements ?? [],
    bugFixes: v?.bugFixes ?? [],
  };
}

export function VersionForm({
  productId,
  version,
  suggested,
  readOnly,
  onSaved,
  onCancel,
}: {
  productId: string;
  version?: VersionRecord | null;
  suggested?: string;
  readOnly?: boolean;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const form = useForm<VersionValues>({ resolver: zodResolver(versionSchema), defaultValues: versionDefaults(version, suggested) });
  const { errors, isSubmitting, isDirty } = form.formState;
  const locked = readOnly || (!!version && version.status !== "draft");

  const onSubmit = form.handleSubmit(async (values) => {
    const r = version
      ? await updateVersionAction({ versionId: version.id, productId, values })
      : await createVersionAction({ productId, values });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    form.reset(values);
    onSaved?.("id" in r ? (r.id as string) : (version?.id ?? ""));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset disabled={readOnly} className="space-y-6">
        <FieldGroup className="grid gap-5 sm:grid-cols-3">
          <Field data-invalid={!!errors.version}>
            <FieldLabel htmlFor="v-version">Version number</FieldLabel>
            <Input id="v-version" className="font-mono" placeholder="1.1.0" disabled={locked} {...form.register("version")} />
            {locked && !readOnly && <FieldDescription>Only drafts can be renumbered.</FieldDescription>}
            <FieldError errors={[errors.version]} />
          </Field>
          <Field data-invalid={!!errors.releaseDate}>
            <FieldLabel htmlFor="v-date">Release date</FieldLabel>
            <Input id="v-date" type="date" {...form.register("releaseDate")} />
            <FieldError errors={[errors.releaseDate]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="v-title">Release title</FieldLabel>
            <Input id="v-title" placeholder="e.g. Multi-currency update" {...form.register("title")} />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="v-notes">Release notes</FieldLabel>
          <Textarea id="v-notes" rows={5} placeholder="Summary of this release for buyers and staff" {...form.register("releaseNotes")} />
        </Field>
        <FieldGroup className="grid gap-5 lg:grid-cols-3">
          <Controller
            control={form.control}
            name="newFeatures"
            render={({ field }) => <LinesField id="v-features" label="New features" hint="Wallet top-up with UPI" value={field.value} onChange={field.onChange} disabled={readOnly} />}
          />
          <Controller
            control={form.control}
            name="improvements"
            render={({ field }) => <LinesField id="v-improvements" label="Improvements" hint="Faster checkout" value={field.value} onChange={field.onChange} disabled={readOnly} />}
          />
          <Controller
            control={form.control}
            name="bugFixes"
            render={({ field }) => <LinesField id="v-fixes" label="Bug fixes" hint="Fixed OTP retry" value={field.value} onChange={field.onChange} disabled={readOnly} />}
          />
        </FieldGroup>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end gap-2 border-t pt-5">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting || (!!version && !isDirty)}>
            {isSubmitting && <Spinner />}
            {version ? "Save version" : "Create version"}
          </Button>
        </div>
      )}
    </form>
  );
}
