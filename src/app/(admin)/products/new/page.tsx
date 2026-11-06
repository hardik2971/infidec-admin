import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getUploadSettings, listPackages } from "@/lib/packages/service";
import { listVersions } from "@/lib/packages/versions";
import { getProduct, listCategoryOptions, listMarketplaceOptions, listProductMedia } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { ProductWizard } from "./product-wizard";

export const metadata: Metadata = { title: "Add New Product" };

async function WizardContent({ searchParams }: { searchParams: PageProps<"/products/new">["searchParams"] }) {
  const session = await requirePermission("products:create");
  const sp = await searchParams;
  const draftId = typeof sp.draft === "string" ? sp.draft : null;
  const requestedStep = Number(typeof sp.step === "string" ? sp.step : 1);

  const [categories, marketplaces, product] = await Promise.all([
    listCategoryOptions(),
    listMarketplaceOptions(),
    draftId ? getProduct(draftId) : Promise.resolve(null),
  ]);
  if (draftId && !product) notFound();
  if (product && product.status !== "draft") redirect(`/products/${product.id}`);
  const [media, versions, packages, settings] = product
    ? await Promise.all([listProductMedia(product.id), listVersions(product.id), listPackages({ productId: product.id }), getUploadSettings()])
    : [[], [], [], await getUploadSettings()];

  const step = product ? Math.min(Math.max(Number.isInteger(requestedStep) ? requestedStep : 1, 1), 8) : 1;

  return (
    <ProductWizard
      product={product}
      media={media}
      step={step}
      categories={categories}
      marketplaces={marketplaces}
      versions={versions.map((v) => ({ id: v.id, productId: v.productId, version: v.version, status: v.status }))}
      packageCount={packages.length}
      maxUploadSizeMb={settings.maxUploadSizeMb}
      canUploadPackages={hasPermission(session.permissions, "packages:upload") && hasPermission(session.permissions, "versions:create")}
      canPublish={hasPermission(session.permissions, "products:publish")}
    />
  );
}

export default function NewProductPage(props: PageProps<"/products/new">) {
  return (
    <>
      <PageHeader
        title="Add New Product"
        description="Set up a product step by step. Your progress is saved as a draft after the first step, so you can leave and continue at any time."
      />
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
            <Skeleton className="h-[28rem] rounded-xl" />
            <Skeleton className="h-[36rem] rounded-xl" />
          </div>
        }
      >
        <WizardContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
