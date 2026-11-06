import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PackagesFilters } from "@/components/packages/packages-filters";
import { PackagesTable } from "@/components/packages/packages-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getUploadSettings, listPackages } from "@/lib/packages/service";
import { listVersions } from "@/lib/packages/versions";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";

export const metadata: Metadata = { title: "All Packages" };

async function PackagesContent({ searchParams }: { searchParams: PageProps<"/packages">["searchParams"] }) {
  const session = await requirePermission("packages:view");
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(sp.product) ? sp.product : undefined;
  const includeHistory = sp.history === "1";

  const [packages, products, versions, settings] = await Promise.all([
    listPackages({ productId, includeHistory }),
    listProducts(),
    listVersions(),
    getUploadSettings(),
  ]);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);

  return (
    <PackagesTable
      packages={packages}
      productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
      versions={versions.map((v) => ({ id: v.id, productId: v.productId, version: v.version, status: v.status }))}
      maxUploadSizeMb={settings.maxUploadSizeMb}
      caps={{ canUpload: can("packages:upload"), canDownload: can("packages:download"), canEdit: can("packages:edit"), canDelete: can("packages:delete") }}
      emptyDescription="Upload complete source ZIPs and app or panel packages for each product version."
      toolbar={<PackagesFilters products={products.map((p) => ({ id: p.id, name: p.name }))} productId={productId} includeHistory={includeHistory} />}
    />
  );
}

export default function PackagesPage(props: PageProps<"/packages">) {
  return (
    <>
      <PageHeader
        title="All Packages"
        description="Every source ZIP across products and versions. Files live in private Firebase Storage and download through short-lived links."
        actions={
          <Button asChild>
            <Link href="/packages/upload">
              <Upload /> Upload ZIP
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <PackagesContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
