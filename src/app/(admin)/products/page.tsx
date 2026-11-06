import { Download, PackagePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listCategoryOptions, listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { ProductsTable } from "./products-table";

export const metadata: Metadata = { title: "All Products" };

async function ProductsContent() {
  const session = await requirePermission("products:view");
  const [products, categories] = await Promise.all([listProducts(), listCategoryOptions()]);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);
  const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="All Products"
        description="Every INFIDEC product in one catalogue — current and future."
        actions={
          can("products:create") ? (
            <>
              <Button asChild variant="outline">
                <Link href="/products/import">
                  <Download /> Import from website
                </Link>
              </Button>
              <Button asChild>
                <Link href="/products/new">
                  <PackagePlus /> Add product
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <ProductsTable
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          tagline: p.tagline,
          status: p.status,
          version: p.version,
          category: categoryNames[p.categoryId] ?? "—",
          currency: p.pricing.currency,
          regular: p.pricing.regular,
          extended: p.pricing.extended,
          thumbnailMediaId: p.thumbnailMediaId,
          updatedAt: p.updatedAt,
          imported: p.source?.type === "website-import",
        }))}
        caps={{
          canEdit: can("products:edit"),
          canCreate: can("products:create"),
          canPublish: can("products:publish"),
          canDelete: can("products:delete"),
        }}
      />
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
