"use client";

import { AlertCircle, ArrowRight, BookOpen, ExternalLink, Globe, Lock, Package } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProductActions, type ProductCapabilities } from "@/components/products/product-actions";
import { PackagesTable, type PackageCaps } from "@/components/packages/packages-table";
import { VersionStatusBadge } from "@/components/packages/version-status-badge";
import { MediaManager } from "@/components/products/media-manager";
import { ProductThumb } from "@/components/products/product-thumb";
import { BasicSection } from "@/components/products/sections/basic-section";
import { ContentSection } from "@/components/products/sections/content-section";
import { LicenseSection } from "@/components/products/sections/license-section";
import { MarketplaceSection } from "@/components/products/sections/marketplace-section";
import { SeoSection } from "@/components/products/sections/seo-section";
import { StatusBadge } from "@/components/products/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { PackageRecord, VersionRecord } from "@/lib/packages/schema";
import {
  basicDefaults,
  contentDefaults,
  licenseDefaults,
  marketplaceDefaults,
  publishBlockers,
  seoDefaults,
  type ProductMediaItem,
  type ProductRecord,
} from "@/lib/products/schema";

const TABS = [
  ["basic", "Basic info"],
  ["content", "Features & content"],
  ["media", "Media"],
  ["license", "Pricing & licence"],
  ["marketplace", "Marketplace"],
  ["seo", "SEO"],
  ["packages", "Packages & versions"],
  ["docs", "Documentation"],
] as const;
type Tab = (typeof TABS)[number][0];

function Upcoming({ icon: Icon, title, phase, body }: { icon: typeof Package; title: string; phase: number; body: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>
          {title} <Badge variant="secondary">Phase {phase}</Badge>
        </EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ProductEditor({
  product,
  media,
  categories,
  marketplaces,
  versions,
  packages,
  maxUploadSizeMb,
  packageCaps,
  canViewVersions,
  initialTab,
  caps,
}: {
  product: ProductRecord;
  media: ProductMediaItem[];
  categories: { id: string; name: string }[];
  marketplaces: { id: string; name: string }[];
  versions: VersionRecord[];
  packages: PackageRecord[];
  maxUploadSizeMb: number;
  packageCaps: PackageCaps;
  canViewVersions: boolean;
  initialTab: string;
  caps: ProductCapabilities;
}) {
  const [tab, setTab] = useState<Tab>(TABS.some(([t]) => t === initialTab) ? (initialTab as Tab) : "basic");
  const readOnly = !caps.canEdit;
  const blockers = publishBlockers(product);
  const category = categories.find((c) => c.id === product.categoryId)?.name;

  function changeTab(next: string) {
    setTab(next as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <ProductThumb mediaId={product.thumbnailMediaId} alt="" className="hidden w-40 shrink-0 shadow-sm sm:block" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{product.name || "Untitled product"}</h1>
              <StatusBadge status={product.status} />
              <Badge variant="outline" className="font-mono">
                v{product.version}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{product.tagline || product.shortDescription}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {category && <span>{category}</span>}
              <code className="font-mono">{product.slug}</code>
              {product.source?.type === "website-import" && (
                <span className="inline-flex items-center gap-1">
                  <Globe className="size-3" /> Imported from infidec.com
                </span>
              )}
              <span>Updated {formatDateTime(product.updatedAt)}</span>
              {product.websiteUrl && (
                <a href={product.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Product page <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {readOnly && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" /> View only
            </Badge>
          )}
          <ProductActions product={product} caps={caps} showEdit={false} trigger="button" />
        </div>
      </div>

      {product.wizard && product.status === "draft" && caps.canEdit && (
        <Card className="border-primary/30 bg-accent/50 py-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <p className="text-sm text-accent-foreground">
              This draft was started in the product wizard — {product.wizard.completedSteps.length} of 8 steps saved.
            </p>
            <Button asChild size="sm">
              <Link href={`/products/new?draft=${product.id}&step=${Math.min(product.wizard.lastStep, 8)}`}>
                Continue setup <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {product.status !== "published" && blockers.length > 0 && (
        <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <span className="font-medium">Before publishing, complete:</span>{" "}
            <span className="text-muted-foreground">{blockers.join(" · ")}</span>
          </p>
        </div>
      )}

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            {TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
                {value === "media" && <span className="text-[10px] text-muted-foreground tabular">{media.length}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <Card className="mt-4">
          <CardContent className="pt-2">
            <TabsContent value="basic">
              <BasicSection productId={product.id} initial={basicDefaults(product)} categories={categories} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="content">
              <ContentSection productId={product.id} initial={contentDefaults(product)} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="media">
              <MediaManager productId={product.id} media={media} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="license">
              <LicenseSection productId={product.id} initial={licenseDefaults(product)} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="marketplace">
              <MarketplaceSection productId={product.id} initial={marketplaceDefaults(product)} marketplaces={marketplaces} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="seo">
              <SeoSection
                productId={product.id}
                initial={seoDefaults(product)}
                fallbackTitle={product.title || product.name}
                fallbackDescription={product.shortDescription}
                url={product.websiteUrl}
                readOnly={readOnly}
              />
            </TabsContent>
            <TabsContent value="packages" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {versions.length} version{versions.length === 1 ? "" : "s"} · {packages.length} active package{packages.length === 1 ? "" : "s"}
                </p>
                {canViewVersions && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/versions?product=${product.id}`}>
                      <Package /> Manage versions
                    </Link>
                  </Button>
                )}
              </div>
              {versions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {versions.map((v) => (
                    <Link
                      key={v.id}
                      href={`/versions/${v.id}`}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="font-mono font-medium">v{v.version}</span>
                      <VersionStatusBadge status={v.status} />
                      <span className="text-xs text-muted-foreground tabular">
                        {v.packageCount} · {formatBytes(v.packageBytes)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              <PackagesTable
                packages={packages}
                productNames={{ [product.id]: product.name }}
                versions={versions.map((v) => ({ id: v.id, productId: v.productId, version: v.version, status: v.status }))}
                caps={packageCaps}
                maxUploadSizeMb={maxUploadSizeMb}
                showProduct={false}
                emptyDescription={versions.length ? "Open a version to upload its packages." : "Create a version first, then upload its source packages."}
              />
            </TabsContent>
            <TabsContent value="docs">
              <Upcoming
                icon={BookOpen}
                phase={4}
                title="Documentation"
                body="Write and publish installation guides, manuals and changelogs, and attach PDF or ZIP documentation."
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
