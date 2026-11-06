import { ExternalLink, GitCommit } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getCatalogSource, getImportPreview } from "@/lib/products/import";
import { hasPermission } from "@/lib/rbac/permissions";
import { formatDateTime } from "@/lib/format";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Import from website" };

async function ImportContent() {
  const session = await requirePermission("products:create");
  const items = await getImportPreview();
  return <ImportPanel items={items} canPublish={hasPermission(session.permissions, "products:publish")} />;
}

export default function ImportPage() {
  const source = getCatalogSource();
  return (
    <>
      <PageHeader
        title="Import from infidec.com"
        description="Review the products published on the INFIDEC website, check for duplicates, then confirm what to import. Nothing is written until you confirm."
      />
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <a href={`${source.website}/products`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
          <ExternalLink className="size-3.5" /> Source: {source.website}/products
        </a>
        <span className="inline-flex items-center gap-1.5">
          <GitCommit className="size-3.5" /> Snapshot of {source.repository}
          {source.commit && <code className="font-mono">@{source.commit.slice(0, 7)}</code>} · {formatDateTime(source.extractedAt)}
        </span>
        <span>
          Refresh with <code className="font-mono">npm run catalog:extract</code>
        </span>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <ImportContent />
      </Suspense>
    </>
  );
}
