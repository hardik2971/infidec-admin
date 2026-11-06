"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getClientAuth } from "@/lib/firebase/client";

const schema = z.object({ email: z.email("Enter a valid email address.") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  async function onSubmit({ email }: Values) {
    setError(null);
    try {
      await sendPasswordResetEmail(await getClientAuth(), email.trim());
      setSentTo(email.trim());
    } catch (e) {
      const code = e instanceof FirebaseError ? e.code : "";
      if (code === "auth/user-not-found") {
        // Don't reveal whether an account exists.
        setSentTo(email.trim());
      } else if (code === "auth/too-many-requests") {
        setError("Too many requests. Please wait a few minutes and try again.");
      } else {
        setError("We couldn't send the reset email. Please try again.");
      }
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-6">
        <div className="flex gap-3 rounded-lg border border-primary/20 bg-accent p-4 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-accent-foreground">
            If <span className="font-medium">{sentTo}</span> belongs to a staff account, a reset link is on its way.
            The link expires after one hour.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Field data-invalid={!!errors.email || !!error}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        <FieldError errors={[errors.email, error ? { message: error } : undefined]} />
      </Field>
      <div className="space-y-3">
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Send reset link
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </div>
    </form>
  );
}
