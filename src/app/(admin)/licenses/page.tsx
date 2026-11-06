import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { LicensesTable } from "@/components/sales/licenses-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { listCustomers, listLicenses } from "@/lib/sales/service";

export const metadata: Metadata = { title: "All Licenses" };

async function Licenses() {
  const session = await requirePermission("licenses:view");
  const [licenses, customers, products] = await Promise.all([listLicenses(), listCustomers(), listProducts()]);
  return (
    <LicensesTable
      licenses={licenses}
      customerNames={Object.fromEntries(customers.map((c) => [c.id, c.name]))}
      productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
      canEdit={hasPermission(session.permissions, "licenses:edit")}
    />
  );
}

export default function LicensesPage() {
  return (
    <>
      <PageHeader
        title="All Licenses"
        description="CodeCanyon licenses come only from verified purchase codes; INFIDEC issues licenses for its own direct sales. Purchase codes are stored as hashes."
        actions={
          <Button asChild>
            <Link href="/licenses/verify">
              <ShieldCheck /> Verify purchase code
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Licenses />
      </Suspense>
    </>
  );
}
