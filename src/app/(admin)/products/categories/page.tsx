import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listCategories } from "@/lib/products/categories";
import { hasPermission } from "@/lib/rbac/permissions";
import { CategoriesTable } from "./categories-table";

export const metadata: Metadata = { title: "Categories" };

async function CategoriesContent() {
  const session = await requirePermission("categories:view");
  const categories = await listCategories();
  return (
    <CategoriesTable
      categories={categories}
      canCreate={hasPermission(session.permissions, "categories:create")}
      canEdit={hasPermission(session.permissions, "categories:edit")}
      canDelete={hasPermission(session.permissions, "categories:delete")}
    />
  );
}

export default function CategoriesPage() {
  return (
    <>
      <PageHeader title="Categories" description="Group products for the catalogue, reports and marketplace listings." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <CategoriesContent />
      </Suspense>
    </>
  );
}
