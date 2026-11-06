"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { VerificationOutcome } from "@/lib/licenses/verification";
import { formatDateTime } from "@/lib/format";
import { recordSaleAction, verifyCodeAction } from "./actions";

const NEW = "__new__";

export function VerifyPanel({
  configured,
  canRecord,
  canConfigure,
  products,
  customers,
}: {
  configured: boolean;
  canRecord: boolean;
  canConfigure: boolean;
  products: { id: string; name: string; itemId: string }[];
  customers: { id: string; name: string; email: string; username: string }[];
}) {
  const [code, setCode] = useState("");
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);
  const [checkedCode, setCheckedCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState(NEW);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [earnings, setEarnings] = useState("");
  const [recorded, setRecorded] = useState<{ customerId: string } | null>(null);

  function verify() {
    setRecorded(null);
    startTransition(async () => {
      const r = await verifyCodeAction(code);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOutcome(r.outcome);
      setCheckedCode(code.trim());
      if (r.outcome.status === "valid") {
        const sale = r.outcome.sale;
        setProductId(r.outcome.product?.id ?? "");
        const known = customers.find((c) => c.username && c.username === sale.buyer);
        setCustomerId(known?.id ?? NEW);
        setName(sale.buyer);
        setEmail("");
        setEarnings(String(sale.amount));
      }
    });
  }

  function record() {
    startTransition(async () => {
      const r = await recordSaleAction({
        code: checkedCode,
        productId,
        customerId: customerId === NEW ? undefined : customerId,
        customerName: name,
        customerEmail: email,
        authorEarnings: earnings === "" ? null : Number(earnings),
      });
      if (r.ok) {
        toast.success(r.message);
        setRecorded({ customerId: r.customerId });
      } else toast.error(r.error);
    });
  }

  if (!configured) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
            <PlugZap className="size-5" />
          </span>
          <p className="font-medium">Connect the Envato API first</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Verification uses your Envato personal token with the “View your items&apos; sales history” permission. It stays on the server, encrypted.
          </p>
          {canConfigure && (
            <Button asChild>
              <Link href="/integrations/envato">Set up Envato API</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const sale = outcome?.status === "valid" ? outcome.sale : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
            >
              <InputGroup className="flex-1">
                <InputGroupAddon>
                  <InputGroupText>
                    <ShieldCheck />
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono"
                  aria-label="Purchase code"
                  autoComplete="off"
                  spellCheck={false}
                />
              </InputGroup>
              <Button type="submit" disabled={pending || code.trim().length < 30}>
                {pending && !sale ? <Spinner /> : <ShieldCheck />} Verify
              </Button>
            </form>
          </CardContent>
        </Card>

        {outcome?.status === "invalid" && (
          <Card className="border-destructive/30">
            <CardContent className="flex gap-3">
              <XCircle className="size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Not a valid sale of your items</p>
                <p className="text-sm text-muted-foreground">Envato doesn&apos;t recognise this code as a purchase of any item in your portfolio. Ask the buyer to double-check it.</p>
              </div>
            </CardContent>
          </Card>
        )}
        {outcome?.status === "error" && (
          <Card className="border-warning/30">
            <CardContent className="flex gap-3">
              <AlertTriangle className="size-5 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Couldn&apos;t verify right now</p>
                <p className="text-sm text-muted-foreground">{outcome.message}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {outcome?.status === "already_recorded" && (
          <Card>
            <CardContent className="flex gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-success" />
              <div className="space-y-1">
                <p className="font-medium">Already recorded</p>
                <p className="text-sm text-muted-foreground">
                  This purchase code belongs to license <span className="font-mono">{outcome.license.licenseKey}</span>.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/customers/${outcome.license.customerId}`}>Open customer</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {sale && (
          <Card className="border-success/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <CheckCircle2 className="size-5 text-success" /> Verified by Envato
              </CardTitle>
              <CardDescription>
                {sale.item.name} · item #{sale.item.id}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Buyer", sale.buyer],
                  ["License", sale.license],
                  ["Purchased", formatDateTime(sale.soldAt)],
                  ["Support until", sale.supportedUntil ? formatDateTime(sale.supportedUntil) : "Not provided"],
                  ["Amount reported by Envato", `$${sale.amount.toFixed(2)}`],
                  ["Buyer's purchases of this item", String(sale.purchaseCount)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 text-sm font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              {recorded ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" /> Customer, order and license recorded.
                  </span>
                  <Button asChild size="sm">
                    <Link href={`/customers/${recorded.customerId}`}>Open customer</Link>
                  </Button>
                </div>
              ) : canRecord ? (
                <div className="space-y-4 rounded-xl border p-4">
                  <p className="font-medium">Record this sale</p>
                  {!outcome || outcome.status !== "valid" || outcome.product ? null : (
                    <p className="flex gap-2 rounded-lg bg-warning/10 p-3 text-xs">
                      <AlertTriangle className="size-4 shrink-0 text-warning" />
                      No product has Envato item ID {sale.item.id}. Choose the product, and add the ID to it (Product → Marketplace) so future codes match automatically.
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="v-product">Product</FieldLabel>
                      <Select value={productId} onValueChange={setProductId}>
                        <SelectTrigger id="v-product" className="w-full">
                          <SelectValue placeholder="Choose the product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                              {p.itemId ? ` · #${p.itemId}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="v-customer">Customer</FieldLabel>
                      <Select value={customerId} onValueChange={setCustomerId}>
                        <SelectTrigger id="v-customer" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW}>New customer ({sale.buyer})</SelectItem>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} · {c.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {customerId === NEW && (
                      <>
                        <Field>
                          <FieldLabel htmlFor="v-name">Name</FieldLabel>
                          <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="v-email">Email</FieldLabel>
                          <Input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ask the buyer — Envato doesn't share it" />
                        </Field>
                      </>
                    )}
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="v-earn">Author earnings (USD)</FieldLabel>
                      <Input id="v-earn" type="number" min={0} step="0.01" className="max-w-48 tabular" value={earnings} onChange={(e) => setEarnings(e.target.value)} />
                      <FieldDescription>
                        Prefilled with the amount Envato reported. Confirm it matches your earnings statement before it counts as revenue — clear it if unsure.
                      </FieldDescription>
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={record} disabled={pending || !productId || (customerId === NEW && !email)}>
                      {pending ? <Spinner /> : <CheckCircle2 />} Record sale & create license
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Your role can verify codes but not record sales.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit gap-3 py-5">
        <CardContent className="space-y-3 px-5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CircleSlash className="size-4 text-primary" /> How verification works
          </p>
          <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
            <li>The code is checked with Envato&apos;s official author-sale API using your server-side token.</li>
            <li>The item is matched to a product by its Envato item ID.</li>
            <li>Codes are stored only as a hash plus the last four characters.</li>
            <li>Every check — valid, invalid or failed — is written to the verification log.</li>
          </ul>
          <Badge variant="secondary">Payments and refunds stay with Envato</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
