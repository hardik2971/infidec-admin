import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getCategories, listTickets } from "@/lib/support/service";
import { CategoriesEditor } from "./categories-editor";

export const metadata: Metadata = { title: "Support Categories" };

async function Categories() {
  const session = await requirePermission("support:view");
  const [categories, tickets] = await Promise.all([getCategories(), listTickets()]);
  const counts = Object.fromEntries(categories.map((c) => [c, tickets.filter((t) => t.category === c).length]));
  return <CategoriesEditor initial={categories} counts={counts} canEdit={hasPermission(session.permissions, "support:edit")} />;
}

export default function CategoriesPage() {
  return (
    <>
      <PageHeader title="Support Categories" description="Categories customers and staff choose when opening a ticket. Renaming a category doesn't change existing tickets." />
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-xl rounded-xl" />}>
        <Categories />
      </Suspense>
    </>
  );
}
