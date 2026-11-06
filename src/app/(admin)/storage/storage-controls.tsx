"use client";

import { Eraser, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cleanupStagingAction, setUploadLimitAction } from "@/app/(admin)/packages/actions";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export function StagingCleanup({ stale }: { stale: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || stale === 0}
      onClick={() =>
        startTransition(async () => {
          const r = await cleanupStagingAction();
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        })
      }
    >
      {pending ? <Spinner /> : <Eraser />} Remove abandoned uploads
    </Button>
  );
}

export function UploadLimitForm({ current, max, canEdit }: { current: number; max: number; canEdit: boolean }) {
  const [value, setValue] = useState(String(current));
  const [pending, startTransition] = useTransition();
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= max;

  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await setUploadLimitAction(n);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
    >
      <InputGroup className="max-w-48">
        <InputGroupInput
          type="number"
          min={1}
          max={max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
          aria-label="Maximum upload size in MB"
          aria-invalid={!valid}
          className="tabular"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>MB</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {canEdit && (
        <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={pending || !valid || n === current}>
          {pending ? <Spinner /> : <Save />} Save
        </Button>
      )}
    </form>
  );
}
