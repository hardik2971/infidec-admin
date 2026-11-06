"use client";

import { Copy, Download, FileArchive, KeyRound, Link2, UserSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LicenseStatusBadge } from "@/components/sales/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import { PACKAGE_TYPE_LABELS, compareSemver, type PackageRecord } from "@/lib/packages/schema";
import { LICENSE_TYPE_LABELS, type LicenseRecord } from "@/lib/sales/schema";
import { issueCustomerDownloadAction } from "./actions";

export function DownloadsPanel({
  customers,
  customer,
  packages,
  licenses,
  productNames,
  canIssue,
}: {
  customers: { id: string; name: string; email: string; status: string }[];
  customer: { id: string; name: string; status: string } | null;
  packages: PackageRecord[];
  licenses: LicenseRecord[];
  productNames: Record<string, string>;
  canIssue: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, { url: string; minutes: number }>>({});
  const byProduct = new Map<string, PackageRecord[]>();
  packages.forEach((p) => byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), p]));

  function issue(pkg: PackageRecord) {
    if (!customer) return;
    setIssuing(pkg.id);
    startTransition(async () => {
      const r = await issueCustomerDownloadAction({ customerId: customer.id, packageId: pkg.id });
      setIssuing(null);
      if (r.ok) {
        setLinks((l) => ({ ...l, [pkg.id]: { url: r.url, minutes: r.expiresInMinutes } }));
        toast.success(`Link created — valid for ${r.expiresInMinutes} minutes.`);
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <UserSearch className="size-5 text-muted-foreground" />
          <Select value={customer?.id ?? ""} onValueChange={(v) => router.push(`/downloads?customer=${v}`)}>
            <SelectTrigger className="w-full max-w-md" aria-label="Customer">
              <SelectValue placeholder={customers.length ? "Choose a customer" : "No customers yet"} />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {c.email}
                  {c.status !== "active" ? " (suspended)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending && <Spinner className="text-muted-foreground" />}
        </CardContent>
      </Card>

      {!customer ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Download />
            </EmptyMedia>
            <EmptyTitle>Check a customer&apos;s downloads</EmptyTitle>
            <EmptyDescription>Choose a customer to see which source packages their licenses entitle them to.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[20rem_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <KeyRound className="size-4" /> Licenses
              </CardTitle>
              <CardDescription>{customer.status === "active" ? "Entitlement comes from active licenses." : "This account is suspended — downloads are blocked."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {licenses.length === 0 && <p className="text-sm text-muted-foreground">No licenses.</p>}
              {licenses.map((l) => (
                <div key={l.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{productNames[l.productId] ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{LICENSE_TYPE_LABELS[l.licenseType]} license</p>
                  <div className="mt-1.5">
                    <LicenseStatusBadge license={l} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {byProduct.size === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No downloadable packages</EmptyTitle>
                  <EmptyDescription>Either there are no active licenses, or those products have no packages in a released version yet.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              [...byProduct.entries()].map(([productId, pkgs]) => (
                <Card key={productId}>
                  <CardHeader>
                    <CardTitle className="text-[15px]">{productNames[productId] ?? "Product"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pkgs
                      .sort((a, b) => compareSemver(b.version, a.version))
                      .map((p) => (
                        <div key={p.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <FileArchive className="size-4 text-primary" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                {p.name} <span className="font-mono text-xs text-muted-foreground">v{p.version}</span>
                              </p>
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {p.fileName} · {formatBytes(p.fileSize)}
                              </p>
                            </div>
                            <Badge variant="outline">{PACKAGE_TYPE_LABELS[p.packageType]}</Badge>
                            {canIssue && (
                              <Button size="sm" variant="outline" disabled={issuing === p.id || customer.status !== "active"} onClick={() => issue(p)}>
                                {issuing === p.id ? <Spinner /> : <Link2 />} Generate link
                              </Button>
                            )}
                          </div>
                          {links[p.id] && (
                            <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
                              <code className="min-w-0 flex-1 truncate text-xs">{links[p.id].url}</code>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Copy link"
                                onClick={() => {
                                  navigator.clipboard.writeText(links[p.id].url);
                                  toast.success(`Copied. Expires in ${links[p.id].minutes} minutes.`);
                                }}
                              >
                                <Copy />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
