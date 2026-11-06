"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { saveRazorpayAction } from "../actions";

export function RazorpayForm({ encryptionReady, keyId: initialKeyId }: { encryptionReady: boolean; keyId: string }) {
  const [keyId, setKeyId] = useState(initialKeyId);
  const [secret, setSecret] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Razorpay credentials</CardTitle>
        <CardDescription>From Razorpay Dashboard → Account &amp; Settings → API Keys. Use test keys until you go live.</CardDescription>
      </CardHeader>
      <CardContent>
        {!encryptionReady ? (
          <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Set INTEGRATION_ENCRYPTION_KEY on the server to store credentials.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await saveRazorpayAction({ keyId, keySecret: secret });
                if (r.ok) {
                  toast.success(r.message);
                  setSecret("");
                } else toast.error(r.error);
              });
            }}
          >
            <Field>
              <FieldLabel htmlFor="rzp-id">Key ID</FieldLabel>
              <Input id="rzp-id" value={keyId} onChange={(e) => setKeyId(e.target.value)} className="font-mono" placeholder="rzp_test_…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="rzp-secret">Key secret</FieldLabel>
              <Input id="rzp-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono" />
              <FieldDescription>Leave empty to keep the stored secret. Write-only.</FieldDescription>
            </Field>
            <Button type="submit" size="sm" disabled={pending || !keyId}>
              {pending ? <Spinner /> : <Save />} Save credentials
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
