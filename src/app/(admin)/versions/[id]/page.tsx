import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getUploadSettings, listPackages } from "@/lib/packages/service";
import { getVersion, listVersions } from "@/lib/packages/versions";
import { getProduct } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { VersionDetail } from "./version-detail";

export const metadata: Metadata = { title: "Version" };

async function VersionContent({ params }: { params: PageProps<"/versions/[id]">["params"] }) {
  const session = await requirePermission("versions:view");
  const { id } = await params;
  const version = await getVersion(id);
  if (!version) notFound();
  const [product, packages, siblings, settings] = await Promise.all([
    getProduct(version.productId),
    listPackages({ versionId: id, includeHistory: true }),
    listVersions(version.productId),
    getUploadSettings(),
  ]);
  if (!product) notFound();
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);

  return (
    <VersionDetail
      version={version}
      product={{ id: product.id, name: product.name, currentVersion: product.version }}
      packages={packages}
      siblings={siblings.map((v) => ({ id: v.id, productId: v.productId, version: v.version, status: v.status }))}
      maxUploadSizeMb={settings.maxUploadSizeMb}
      caps={{
        canEditVersion: can("versions:edit"),
        canPublish: can("versions:publish"),
        canDelete: can("versions:delete"),
        packages: { canUpload: can("packages:upload"), canDownload: can("packages:download"), canEdit: can("packages:edit"), canDelete: can("packages:delete") },
      }}
    />
  );
}

export default function VersionPage(props: PageProps<"/versions/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-16 w-96" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      }
    >
      <VersionContent params={props.params} />
    </Suspense>
  );
}
