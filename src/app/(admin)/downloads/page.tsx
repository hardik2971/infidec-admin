import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { entitledPackages } from "@/lib/downloads/service";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listCustomers, listLicenses } from "@/lib/sales/service";
import { DownloadsPanel } from "./downloads-panel";

export const metadata: Metadata = { title: "Download Packages" };

async function Downloads({ searchParams }: { searchParams: PageProps<"/downloads">["searchParams"] }) {
  const session = await requirePermission("downloads:view");
  const sp = await searchParams;
  const [customers, products] = await Promise.all([listCustomers(), listProducts()]);
  const customer = customers.find((c) => c.id === sp.customer) ?? null;
  const [packages, licenses] = customer ? await Promise.all([entitledPackages(customer.id), listLicenses({ customerId: customer.id })]) : [[], []];

  return (
    <DownloadsPanel
      customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email, status: c.status }))}
      customer={customer ? { id: customer.id, name: customer.name, status: customer.status } : null}
      packages={packages}
      licenses={licenses}
      productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
      canIssue={hasPermission(session.permissions, "downloads:download")}
    />
  );
}

export default function DownloadsPage(props: PageProps<"/downloads">) {
  return (
    <>
      <PageHeader
        title="Download Packages"
        description="What each customer is entitled to download. Links are generated only after the server checks the customer's license, and expire quickly."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Downloads searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
