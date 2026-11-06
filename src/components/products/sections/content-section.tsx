"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm, type Control, type UseFormRegister } from "react-hook-form";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contentSchema, type ContentValues } from "@/lib/products/schema";
import { SectionFooter, useSectionSubmit, type SectionProps } from "./section-form";

function FeatureItems({
  control,
  register,
  groupIndex,
  readOnly,
}: {
  control: Control<ContentValues>;
  register: UseFormRegister<ContentValues>;
  groupIndex: number;
  readOnly?: boolean;
}) {
  const items = useFieldArray({ control, name: `features.${groupIndex}.items` });
  return (
    <div className="space-y-2">
      {items.fields.map((item, i) => (
        <div key={item.id} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
          <Input placeholder="Feature" aria-label="Feature title" {...register(`features.${groupIndex}.items.${i}.title`)} />
          <Input placeholder="Description" aria-label="Feature description" {...register(`features.${groupIndex}.items.${i}.text`)} />
          {!readOnly && (
            <Button type="button" variant="ghost" size="icon" onClick={() => items.remove(i)} aria-label="Remove feature">
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button type="button" variant="ghost" size="sm" onClick={() => items.append({ title: "", text: "" })}>
          <Plus /> Add feature
        </Button>
      )}
    </div>
  );
}

export function ContentSection(props: SectionProps & { initial: ContentValues }) {
  const form = useForm<ContentValues>({ resolver: zodResolver(contentSchema), defaultValues: props.initial });
  const onSubmit = useSectionSubmit(form, "content", props);
  const groups = useFieldArray({ control: form.control, name: "features" });
  const requirements = useFieldArray({ control: form.control, name: "requirements" });
  const { readOnly } = props;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <fieldset disabled={readOnly} className="space-y-10">
        <FieldSet>
          <FieldLegend>Feature groups</FieldLegend>
          <FieldDescription>Grouped by app or panel, as shown on the product page.</FieldDescription>
          <div className="space-y-4">
            {groups.fields.map((g, i) => (
              <div key={g.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <Input placeholder="Group title (e.g. Admin Panel)" aria-label="Group title" className="font-medium" {...form.register(`features.${i}.title`)} />
                    <Controller
                      control={form.control}
                      name={`features.${i}.subtitle`}
                      render={({ field }) => (
                        <Input
                          placeholder="Subtitle (optional)"
                          aria-label="Group subtitle"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      )}
                    />
                  </div>
                  {!readOnly && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => groups.remove(i)} aria-label="Remove group">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                <FeatureItems control={form.control} register={form.register} groupIndex={i} readOnly={readOnly} />
              </div>
            ))}
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={() => groups.append({ title: "", subtitle: null, items: [] })}>
                <Plus /> Add feature group
              </Button>
            )}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Requirements</FieldLegend>
          <div className="space-y-2">
            {requirements.fields.map((r, i) => (
              <div key={r.id} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
                <Input placeholder="Label" aria-label="Requirement label" {...form.register(`requirements.${i}.title`)} />
                <Textarea rows={2} placeholder="Details" aria-label="Requirement details" {...form.register(`requirements.${i}.text`)} />
                {!readOnly && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => requirements.remove(i)} aria-label="Remove requirement">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button type="button" variant="ghost" size="sm" onClick={() => requirements.append({ title: "", text: "" })}>
                <Plus /> Add requirement
              </Button>
            )}
          </div>
        </FieldSet>

        <Field>
          <FieldLabel htmlFor="whatYouGet">What the buyer gets</FieldLabel>
          <Controller
            control={form.control}
            name="whatYouGet"
            render={({ field }) => (
              <TagInput id="whatYouGet" value={field.value} onChange={field.onChange} max={40} placeholder="Flutter Customer App…" disabled={readOnly} />
            )}
          />
        </Field>
      </fieldset>
      <SectionFooter form={form as never} readOnly={readOnly} wizardStep={props.wizardStep} submitLabel={props.submitLabel} footerStart={props.footerStart} />
    </form>
  );
}
