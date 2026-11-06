"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { generalSettingsSchema, type GeneralSettings } from "@/lib/settings/schema";
import { saveGeneralSettingsAction } from "./actions";

export function GeneralSettingsForm({
  settings,
  canEdit,
  timeZone,
  maxUploadMb,
  sessionDays,
}: {
  settings: GeneralSettings & { updatedAt: string | null; updatedByEmail: string | null };
  canEdit: boolean;
  timeZone: string;
  maxUploadMb: number;
  sessionDays: number;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<GeneralSettings>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      baseCurrency: settings.baseCurrency,
      maxUploadSizeMb: settings.maxUploadSizeMb,
      signedUrlTtlMinutes: settings.signedUrlTtlMinutes,
    },
  });
  const { errors, isDirty } = form.formState;
  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      const r = await saveGeneralSettingsAction(values);
      if (r.ok) {
        toast.success(r.message);
        form.reset(values);
      } else toast.error(r.error);
    }),
  );

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Platform</CardTitle>
          <CardDescription>Shown in customer emails and reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field data-invalid={!!errors.platformName}>
            <FieldLabel htmlFor="platformName">Platform name</FieldLabel>
            <Input id="platformName" disabled={!canEdit} {...form.register("platformName")} />
            <FieldDescription>Used as the sender brand in emails, e.g. “INFIDEC”.</FieldDescription>
            <FieldError errors={[errors.platformName]} />
          </Field>
          <Field data-invalid={!!errors.supportEmail}>
            <FieldLabel htmlFor="supportEmail">Support email</FieldLabel>
            <Input id="supportEmail" type="email" placeholder="support@infidec.com" disabled={!canEdit} {...form.register("supportEmail")} />
            <FieldDescription>Optional. Customers can reply to this address.</FieldDescription>
            <FieldError errors={[errors.supportEmail]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="baseCurrency">Base currency</FieldLabel>
            <Controller
              control={form.control}
              name="baseCurrency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                  <SelectTrigger id="baseCurrency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR — Indian rupee</SelectItem>
                    <SelectItem value="USD">USD — US dollar</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Dashboards and analytics chart this currency. Other currencies are listed separately and never converted.</FieldDescription>
          </Field>
          <div className="rounded-lg border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Display time zone</p>
            <p className="font-mono text-xs">{timeZone}</p>
            <p className="mt-1 text-xs text-muted-foreground">Set with NEXT_PUBLIC_APP_TIME_ZONE so the server and browser always agree.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Files &amp; security</CardTitle>
          <CardDescription>Limits for source packages and customer downloads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field data-invalid={!!errors.maxUploadSizeMb}>
            <FieldLabel htmlFor="maxUploadSizeMb">Maximum package upload (MB)</FieldLabel>
            <Input id="maxUploadSizeMb" type="number" min={1} max={maxUploadMb} disabled={!canEdit} {...form.register("maxUploadSizeMb", { valueAsNumber: true })} />
            <FieldDescription>Up to {maxUploadMb} MB (the Storage rules limit).</FieldDescription>
            <FieldError errors={[errors.maxUploadSizeMb]} />
          </Field>
          <Field data-invalid={!!errors.signedUrlTtlMinutes}>
            <FieldLabel htmlFor="signedUrlTtlMinutes">Download link lifetime (minutes)</FieldLabel>
            <Input id="signedUrlTtlMinutes" type="number" min={1} max={60} disabled={!canEdit} {...form.register("signedUrlTtlMinutes", { valueAsNumber: true })} />
            <FieldDescription>How long a signed download link stays valid (1–60).</FieldDescription>
            <FieldError errors={[errors.signedUrlTtlMinutes]} />
          </Field>
          <div className="rounded-lg border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Staff session length</p>
            <p className="text-sm">{sessionDays} day(s)</p>
            <p className="mt-1 text-xs text-muted-foreground">Set with SESSION_COOKIE_DAYS on the server.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 xl:col-span-2">
        <p className="text-xs text-muted-foreground">
          {settings.updatedAt ? `Last changed ${formatDateTime(settings.updatedAt)}${settings.updatedByEmail ? ` by ${settings.updatedByEmail}` : ""}` : ""}
        </p>
        {canEdit && (
          <Button type="submit" disabled={pending || !isDirty}>
            {pending ? <Spinner /> : <Save />} Save settings
          </Button>
        )}
      </div>
    </form>
  );
}
