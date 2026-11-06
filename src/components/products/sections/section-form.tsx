"use client";

import { Save } from "lucide-react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { saveProductSectionAction } from "@/app/(admin)/products/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SectionKey } from "@/lib/products/schema";

export interface SectionProps {
  productId: string;
  readOnly?: boolean;
  /** Wizard step number: records progress and changes the button label. */
  wizardStep?: number;
  submitLabel?: string;
  onSaved?: () => void;
  /** Extra footer content (e.g. the wizard's Back button). */
  footerStart?: React.ReactNode;
}

/** Shared submit pipeline for every product section form. */
export function useSectionSubmit<T extends FieldValues>(
  form: UseFormReturn<T>,
  section: SectionKey,
  { productId, wizardStep, onSaved }: SectionProps,
) {
  return form.handleSubmit(async (values) => {
    const result = await saveProductSectionAction({ productId, section, values, wizardStep });
    if (!result.ok) {
      for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(path as Path<T>, { message });
      }
      toast.error(result.error);
      return;
    }
    form.reset(values);
    if (!wizardStep) toast.success(result.message ?? "Saved");
    onSaved?.();
  });
}

export function SectionFooter({
  form,
  readOnly,
  wizardStep,
  submitLabel,
  footerStart,
}: {
  form: UseFormReturn<FieldValues> | UseFormReturn<never>;
  readOnly?: boolean;
  wizardStep?: number;
  submitLabel?: string;
  footerStart?: React.ReactNode;
}) {
  const { isSubmitting, isDirty } = (form as UseFormReturn<FieldValues>).formState;
  if (readOnly) return footerStart ? <div className="flex justify-between border-t pt-5">{footerStart}</div> : null;
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-5">
      <div>{footerStart}</div>
      <div className="flex items-center gap-3">
        {!wizardStep && isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="submit" disabled={isSubmitting || (!wizardStep && !isDirty)}>
          {isSubmitting ? <Spinner /> : !wizardStep && <Save />}
          {submitLabel ?? (wizardStep ? "Save & continue" : "Save changes")}
        </Button>
      </div>
    </div>
  );
}
