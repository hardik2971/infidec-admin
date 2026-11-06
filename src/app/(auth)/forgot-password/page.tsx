import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your staff email and we&apos;ll send you a secure link to choose a new password.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
