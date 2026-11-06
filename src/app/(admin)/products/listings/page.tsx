import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { readiness } from "@/lib/listings/schema";
import { listListings } from "@/lib/listings/service";
import { listMarketplaceOptions, listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { ListingsBoard } from "./listings-board";

export const metadata: Metadata = { title: "Marketplace Listings" };

async function Listings() {
  const session = await requirePermission("listings:view");
  const [listings, products, marketplaces] = await Promise.all([listListings(), listProducts(), listMarketplaceOptions()]);
  return (
    <ListingsBoard
      listings={listings.map((l) => ({ ...l, readiness: readiness(l) }))}
      products={products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }))}
      marketplaces={marketplaces.filter((m) => m.id !== "infidec")}
      canCreate={hasPermission(session.permissions, "listings:create")}
    />
  );
}

export default function ListingsPage() {
  return (
    <>
      <PageHeader
        title="Marketplace Listings"
        description="Prepare and track CodeCanyon submissions. Submitting happens on the marketplace itself — this tracks every step, review result and resubmission."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Listings />
      </Suspense>
    </>
  );
}
