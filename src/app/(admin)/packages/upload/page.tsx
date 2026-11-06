import { GitBranch, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PackageUploader } from "@/components/packages/package-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getUploadSettings } from "@/lib/packages/service";
import { listVersions } from "@/lib/packages/versions";
import { listProducts } from "@/lib/products/service";

export const metadata: Metadata = { title: "Upload ZIP" };

async function UploadContent() {
  await requirePermission("packages:upload");
  const [products, versions, settings] = await Promise.all([listProducts(), listVersions(), getUploadSettings()]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <Card>
        <CardContent>
          <PackageUploader
            products={products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }))}
            versions={versions.map((v) => ({ id: v.id, productId: v.productId, version: v.version, status: v.status }))}
            maxUploadSizeMb={settings.maxUploadSizeMb}
          />
        </CardContent>
      </Card>
      <aside className="space-y-4 text-sm">
        <Card className="gap-3 py-5">
          <CardContent className="space-y-3 px-5">
            <p className="flex items-center gap-2 font-medium">
              <Info className="size-4 text-primary" /> What happens on upload
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
              <li>The ZIP goes straight from your browser into a private staging folder.</li>
              <li>The server checks the ZIP structure, rejects corrupted, encrypted or unsafe archives, and computes a SHA-256 checksum.</li>
              <li>Identical files already stored for the product are detected.</li>
              <li>The package is filed under the product&apos;s version. Nothing in it is extracted or executed.</li>
            </ol>
          </CardContent>
        </Card>
        <Card className="gap-3 py-5">
          <CardContent className="space-y-3 px-5">
            <p className="text-muted-foreground">Need a new release? Create the version first, then upload its packages.</p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/versions">
                <GitBranch /> Version management
              </Link>
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function UploadPage() {
  return (
    <>
      <PageHeader title="Upload ZIP" description="Upload complete source code and app, panel or module packages to a product version." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <UploadContent />
      </Suspense>
    </>
  );
}
