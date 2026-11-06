import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { compareSemver } from "@/lib/packages/schema";
import { listVersions } from "@/lib/packages/versions";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { VersionsBoard } from "./versions-board";

export const metadata: Metadata = { title: "Version Management" };

function nextMinor(versions: string[]) {
  const top = versions.sort(compareSemver).at(-1);
  if (!top) return "1.0.0";
  const [maj, min] = top.split(".").map(Number);
  return `${maj}.${min + 1}.0`;
}

async function VersionsContent({ searchParams }: { searchParams: PageProps<"/versions">["searchParams"] }) {
  const session = await requirePermission("versions:view");
  const sp = await searchParams;
  const [products, all] = await Promise.all([listProducts(), listVersions()]);
  const active = products.filter((p) => p.status !== "archived");
  const selected = active.find((p) => p.id === sp.product) ?? active[0] ?? null;
  const versions = selected ? all.filter((v) => v.productId === selected.id) : [];

  return (
    <VersionsBoard
      products={active.map((p) => ({
        id: p.id,
        name: p.name,
        currentVersion: p.version,
        versionCount: all.filter((v) => v.productId === p.id).length,
      }))}
      selected={selected ? { id: selected.id, name: selected.name, currentVersion: selected.version } : null}
      versions={versions}
      suggestedVersion={selected ? (versions.some((v) => v.version === selected.version) ? nextMinor(versions.map((v) => v.version)) : selected.version) : "1.0.0"}
      canCreate={hasPermission(session.permissions, "versions:create")}
    />
  );
}

export default function VersionsPage(props: PageProps<"/versions">) {
  return (
    <>
      <PageHeader
        title="Version Management"
        description="Each product keeps its own release history. A version holds its packages, release notes, new features and bug fixes."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full rounded-xl" />}>
        <VersionsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
