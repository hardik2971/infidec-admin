import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listDocs, listRevisions } from "@/lib/docs/service";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { DocsWorkspace } from "./docs-workspace";

export const metadata: Metadata = { title: "Documentation CMS" };

async function Workspace({ searchParams }: { searchParams: PageProps<"/documentation">["searchParams"] }) {
  const session = await requirePermission("documentation:view");
  const sp = await searchParams;
  const products = (await listProducts()).filter((p) => p.status !== "archived");
  const product = products.find((p) => p.id === sp.product) ?? products[0] ?? null;
  const docs = product ? await listDocs(product.id) : [];
  const selected = docs.find((d) => d.id === sp.doc) ?? null;
  const revisions = selected ? await listRevisions(selected.id) : [];
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);

  return (
    <>
      <PageHeader
        title="Documentation CMS"
        description="Write, organise and publish product documentation. Every save keeps the previous version."
        actions={
          product ? (
            <Button asChild variant="outline">
              <Link href={`/documentation/preview/${product.id}`}>
                <Eye /> Public preview
              </Link>
            </Button>
          ) : null
        }
      />
      <DocsWorkspace
        key={`${product?.id}-${selected?.id}-${selected?.revision}`}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        productId={product?.id ?? null}
        docs={docs}
        selected={selected}
        revisions={revisions}
        caps={{
          create: can("documentation:create"),
          edit: can("documentation:edit"),
          publish: can("documentation:publish"),
          remove: can("documentation:delete"),
          upload: can("documentation:upload"),
        }}
      />
    </>
  );
}

export default function DocumentationPage(props: PageProps<"/documentation">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-[32rem] rounded-xl" />
          <Skeleton className="h-[32rem] rounded-xl" />
        </div>
      }
    >
      <Workspace searchParams={props.searchParams} />
    </Suspense>
  );
}
