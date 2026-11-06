import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getUploadSettings, listPackages } from "@/lib/packages/service";
import { listVersions } from "@/lib/packages/versions";
import { getProduct, listCategoryOptions, listMarketplaceOptions, listProductMedia } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { ProductEditor } from "./product-editor";

export const metadata: Metadata = { title: "Product" };

async function ProductContent({ params, searchParams }: PageProps<"/products/[id]">) {
  const session = await requirePermission("products:view");
  const { id } = await params;
  const sp = await searchParams;
  const product = await getProduct(id);
  if (!product) notFound();

  const [media, categories, marketplaces, versions, packages, settings] = await Promise.all([
    listProductMedia(id),
    listCategoryOptions(),
    listMarketplaceOptions(),
    listVersions(id),
    listPackages({ productId: id }),
    getUploadSettings(),
  ]);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);

  return (
    <ProductEditor
      key={product.id}
      product={product}
      media={media}
      categories={categories}
      marketplaces={marketplaces}
      versions={versions}
      packages={packages}
      maxUploadSizeMb={settings.maxUploadSizeMb}
      packageCaps={{
        canUpload: can("packages:upload"),
        canDownload: can("packages:download"),
        canEdit: can("packages:edit"),
        canDelete: can("packages:delete"),
      }}
      canViewVersions={can("versions:view")}
      initialTab={typeof sp.tab === "string" ? sp.tab : "basic"}
      caps={{
        canEdit: can("products:edit"),
        canCreate: can("products:create"),
        canPublish: can("products:publish"),
        canDelete: can("products:delete"),
      }}
    />
  );
}

export default function ProductPage(props: PageProps<"/products/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex gap-4">
            <Skeleton className="h-20 w-40 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-[28rem] w-full rounded-xl" />
        </div>
      }
    >
      <ProductContent {...props} />
    </Suspense>
  );
}
