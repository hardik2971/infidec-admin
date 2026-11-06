"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { sendPasswordResetEmail } from "firebase/auth";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { getClientAuth } from "@/lib/firebase/client";
import type { RoleId } from "@/lib/rbac/roles";
import { createStaffAction } from "./actions";

const schema = z.object({
  displayName: z.string().trim().min(2, "Enter the staff member's name.").max(80),
  email: z.email("Enter a valid email address."),
  roleId: z.string().min(1, "Choose a role."),
});
type Values = z.infer<typeof schema>;

export function AddStaffDialog({ roles }: { roles: { id: RoleId; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", email: "", roleId: "read_only" },
  });

  async function onSubmit(values: Values) {
    const result = await createStaffAction({ ...values, roleId: values.roleId as RoleId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Firebase sends its "reset password" email, which doubles as the invite to set a password.
    try {
      await sendPasswordResetEmail(await getClientAuth(), values.email.trim());
      toast.success(result.message ?? "Staff member added", {
        description: `A password setup link was emailed to ${values.email}.`,
      });
    } catch {
      toast.warning("Staff member added, but the setup email could not be sent.", {
        description: "They can use “Forgot password” on the sign-in page.",
      });
    }
    form.reset();
    setOpen(false);
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email to set their password. Access follows the role you choose.
          </DialogDescription>
        </DialogHeader>
        <form id="add-staff" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.displayName}>
              <FieldLabel htmlFor="displayName">Full name</FieldLabel>
              <Input id="displayName" autoComplete="off" aria-invalid={!!errors.displayName} {...form.register("displayName")} />
              <FieldError errors={[errors.displayName]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="staffEmail">Work email</FieldLabel>
              <Input id="staffEmail" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.roleId}>
              <FieldLabel htmlFor="roleId">Role</FieldLabel>
              <Controller
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="roleId" className="w-full">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>Permissions for each role are listed under Roles &amp; Permissions.</FieldDescription>
              <FieldError errors={[errors.roleId]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="add-staff" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Add staff member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
