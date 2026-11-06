import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getListing } from "@/lib/listings/service";
import { listPackages } from "@/lib/packages/service";
import { listVersions } from "@/lib/packages/versions";
import { getProduct, listProductMedia } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { ListingEditor } from "./listing-editor";

export const metadata: Metadata = { title: "Submission" };

async function Listing({ params }: { params: PageProps<"/products/listings/[id]">["params"] }) {
  const session = await requirePermission("listings:view");
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  const [product, versions, packages, media] = await Promise.all([
    getProduct(listing.productId),
    listVersions(listing.productId),
    listPackages({ productId: listing.productId }),
    listProductMedia(listing.productId),
  ]);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);

  return (
    <ListingEditor
      key={`${listing.id}-${listing.updatedAt}`}
      listing={listing}
      productName={product?.name ?? "Product"}
      versions={versions.map((v) => ({ id: v.id, version: v.version, status: v.status }))}
      packages={packages.map((p) => ({ id: p.id, versionId: p.versionId, name: p.name, fileName: p.fileName, type: p.packageType }))}
      media={media.map((m) => ({ id: m.id, kind: m.kind, alt: m.alt }))}
      caps={{ edit: can("listings:edit"), submit: can("listings:publish"), approve: can("listings:approve"), remove: can("listings:delete") }}
    />
  );
}

export default function ListingPage(props: PageProps<"/products/listings/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
      <Listing params={props.params} />
    </Suspense>
  );
}
