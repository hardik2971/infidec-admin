"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FirebaseError } from "firebase/app";
import { sendEmailVerification, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { AlertCircle, Eye, EyeOff, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getClientAuth } from "@/lib/firebase/client";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled. Contact a Super Admin.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes or reset your password.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
};

/** Only allow same-site relative redirects. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);
  const [sendingVerification, setSendingVerification] = useState(false);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    setUnverifiedUser(null);
    const auth = await getClientAuth();
    try {
      const { user } = await signInWithEmailAndPassword(auth, values.email.trim(), values.password);
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string };

      if (!res.ok) {
        if (body.code === "email-unverified") {
          setUnverifiedUser(user);
          return; // keep the in-memory user so a verification email can be sent
        }
        await signOut(auth);
        setFormError(body.message ?? "Sign-in failed. Please try again.");
        return;
      }

      await signOut(auth); // the httpOnly session cookie is now the source of truth
      toast.success("Signed in");
      router.replace(next);
      router.refresh();
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : "";
      setFormError(FIREBASE_ERRORS[code] ?? "Sign-in failed. Please try again.");
    }
  }

  async function resendVerification() {
    if (!unverifiedUser) return;
    setSendingVerification(true);
    try {
      await sendEmailVerification(unverifiedUser);
      toast.success("Verification email sent", { description: `Check ${unverifiedUser.email} and then sign in again.` });
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : "";
      toast.error(FIREBASE_ERRORS[code] ?? "Could not send the verification email.");
    } finally {
      setSendingVerification(false);
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError && (
        <div role="alert" className="flex gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}

      {unverifiedUser && (
        <div role="status" className="space-y-3 rounded-lg border border-primary/20 bg-accent p-4 text-sm">
          <div className="flex gap-2.5">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-accent-foreground">
              Your email address hasn&apos;t been verified yet. Verify it, then sign in again.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={resendVerification} disabled={sendingVerification}>
            {sendingVerification && <Spinner />}
            Send verification email
          </Button>
        </div>
      )}

      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@infidec.com"
            aria-invalid={!!errors.email}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <InputGroup>
            <InputGroupInput
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Spinner />}
        Sign in
      </Button>
    </form>
  );
}
