"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, CircleDashed, Clock, Package, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { completeWizardStepAction, setProductStatusAction } from "@/app/(admin)/products/actions";
import { createVersionAction } from "@/app/(admin)/versions/actions";
import { PackageUploader, type UploaderVersion } from "@/components/packages/package-uploader";
import { MediaManager } from "@/components/products/media-manager";
import { BasicSection } from "@/components/products/sections/basic-section";
import { LicenseSection } from "@/components/products/sections/license-section";
import { MarketplaceSection } from "@/components/products/sections/marketplace-section";
import { SeoSection } from "@/components/products/sections/seo-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney } from "@/lib/format";
import {
  PRODUCT_TYPE_LABELS,
  basicDefaults,
  licenseDefaults,
  marketplaceDefaults,
  publishBlockers,
  seoDefaults,
  type ProductMediaItem,
  type ProductRecord,
} from "@/lib/products/schema";
import { cn } from "@/lib/utils";

type StepState = "complete" | "incomplete" | "deferred" | "optional";

const STEPS = [
  { n: 1, title: "Basic information", hint: "Name, category, descriptions" },
  { n: 2, title: "Marketplace", hint: "Where it's sold" },
  { n: 3, title: "Images & media", hint: "Logo, thumbnail, screenshots" },
  { n: 4, title: "Source code ZIP", hint: "Packages per version" },
  { n: 5, title: "Documentation", hint: "Guides and manuals" },
  { n: 6, title: "Licence & pricing", hint: "Regular, extended, support" },
  { n: 7, title: "SEO", hint: "Search appearance" },
  { n: 8, title: "Review & publish", hint: "Check and go live" },
] as const;

function stepState(n: number, p: ProductRecord | null, packageCount = 0): StepState {
  if (!p) return n === 1 ? "incomplete" : "incomplete";
  const visited = p.wizard?.completedSteps.includes(n) ?? false;
  switch (n) {
    case 1:
      // Same fields publishing requires from this step.
      return p.name && p.categoryId && p.shortDescription.length >= 10 && p.fullDescription ? "complete" : "incomplete";
    case 2:
      return visited || p.marketplaceId ? "complete" : "optional";
    case 3:
      return p.thumbnailMediaId ? "complete" : "incomplete";
    case 4:
      return packageCount > 0 ? "complete" : "optional";
    case 5:
      return "deferred";
    case 6:
      return p.pricing.regular > 0 ? "complete" : "incomplete";
    case 7:
      return p.seo.title && p.seo.description ? "complete" : "incomplete";
    default:
      return publishBlockers(p).length === 0 ? "complete" : "incomplete";
  }
}

function Deferred({ icon: Icon, title, phase, body }: { icon: typeof Package; title: string; phase: number; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="flex items-center justify-center gap-2 font-medium">
          {title} <Badge variant="secondary">Phase {phase}</Badge>
        </p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export function ProductWizard({
  product,
  media,
  step,
  categories,
  marketplaces,
  versions,
  packageCount,
  maxUploadSizeMb,
  canUploadPackages,
  canPublish,
}: {
  product: ProductRecord | null;
  media: ProductMediaItem[];
  step: number;
  categories: { id: string; name: string }[];
  marketplaces: { id: string; name: string }[];
  versions: UploaderVersion[];
  packageCount: number;
  maxUploadSizeMb: number;
  canUploadPackages: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = product?.id ?? null;

  const go = (n: number, draftId = id) => router.push(`/products/new?draft=${draftId}&step=${n}`, { scroll: false });
  const next = () => go(step + 1);
  const back = step > 1 ? (
    <Button type="button" variant="ghost" onClick={() => go(step - 1)}>
      <ArrowLeft /> Back
    </Button>
  ) : null;

  function continueFrom(n: number) {
    if (!id) return;
    startTransition(async () => {
      const r = await completeWizardStepAction({ productId: id, step: n });
      if (!r.ok) toast.error(r.error);
      else go(n + 1);
    });
  }

  function finish(status: "published" | "in_review" | "draft") {
    if (!id) return;
    if (status === "draft") {
      toast.success("Saved as draft.");
      router.push(`/products/${id}`);
      return;
    }
    startTransition(async () => {
      const r = await setProductStatusAction({ productId: id, status });
      if (r.ok) {
        toast.success(status === "published" ? "Product published." : "Submitted for review.");
        router.push(`/products/${id}`);
      } else toast.error(r.error);
    });
  }

  const states = STEPS.map((s) => stepState(s.n, product, packageCount));
  const currentVersion = product ? versions.find((v) => v.version === product.version) : undefined;

  function createCurrentVersion() {
    if (!product) return;
    startTransition(async () => {
      const r = await createVersionAction({
        productId: product.id,
        values: { version: product.version, releaseDate: product.releaseDate, title: "Initial release", releaseNotes: "", newFeatures: [], improvements: [], bugFixes: [] },
      });
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  const required = [1, 3, 6, 7];
  const done = required.filter((n) => states[n - 1] === "complete").length;
  const percent = Math.round((done / required.length) * 100);
  const current = STEPS[step - 1];
  const blockers = product ? publishBlockers(product) : [];
  const continueFooter = (n: number, label = "Continue") => (
    <div className="flex items-center justify-between border-t pt-5">
      <div>{back}</div>
      <Button type="button" onClick={() => continueFrom(n)} disabled={pending}>
        {pending && <Spinner />} {label} <ArrowRight />
      </Button>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="gap-3 py-4">
          <CardContent className="space-y-2 px-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{product?.name || "New product"}</p>
              <span className="text-xs text-muted-foreground tabular">{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Required steps completed">
              <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {done} of {required.length} required steps complete
            </p>
          </CardContent>
        </Card>

        <nav aria-label="Wizard steps">
          <ol className="space-y-0.5">
            {STEPS.map((s, i) => {
              const state = states[i];
              const active = s.n === step;
              const reachable = !!id || s.n === 1;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => go(s.n)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      active ? "bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular",
                        state === "complete" && "border-transparent bg-primary text-primary-foreground",
                        active && state !== "complete" && "border-primary text-primary",
                      )}
                    >
                      {state === "complete" ? <Check className="size-3.5" /> : state === "deferred" ? <Clock className="size-3" /> : s.n}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-sm", active ? "font-medium" : "text-foreground/85")}>{s.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {state === "deferred" ? "Available in Phase 4" : state === "optional" ? "Optional" : s.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      <Card className="animate-in-up" key={step}>
        <CardHeader className="border-b">
          <CardDescription>
            Step {step} of {STEPS.length}
          </CardDescription>
          <CardTitle className="text-lg">{current.title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {step === 1 && (
            <BasicSection
              productId={id}
              initial={basicDefaults(product)}
              categories={categories}
              wizardStep={1}
              onCreated={(newId) => go(2, newId)}
              onSaved={next}
            />
          )}
          {step === 2 && product && (
            <MarketplaceSection productId={product.id} initial={marketplaceDefaults(product)} marketplaces={marketplaces} wizardStep={2} onSaved={next} footerStart={back} />
          )}
          {step === 3 && product && (
            <div className="space-y-8">
              <MediaManager productId={product.id} media={media} />
              {continueFooter(3, product.thumbnailMediaId ? "Continue" : "Skip for now")}
            </div>
          )}
          {step === 4 && product && (
            <div className="space-y-8">
              {!canUploadPackages ? (
                <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                  Your role can&apos;t upload packages. Someone with upload access can add them from the product page.
                </p>
              ) : currentVersion ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Packages go to <span className="font-mono font-medium text-foreground">v{currentVersion.version}</span>
                    {packageCount > 0 && ` · ${packageCount} uploaded so far`}. Upload the complete source and any separate app or panel ZIPs.
                  </p>
                  <PackageUploader
                    products={[]}
                    versions={versions}
                    fixedProductId={product.id}
                    fixedVersionId={currentVersion.id}
                    maxUploadSizeMb={maxUploadSizeMb}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
                  <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                    <Package className="size-5" />
                  </span>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Source packages belong to a version. Create <span className="font-mono">v{product.version}</span> (the version from step 1) to start uploading.
                  </p>
                  <Button onClick={createCurrentVersion} disabled={pending}>
                    {pending && <Spinner />} Create v{product.version}
                  </Button>
                </div>
              )}
              {continueFooter(4, packageCount > 0 ? "Continue" : "Skip for now")}
            </div>
          )}
          {step === 5 && (
            <div className="space-y-8">
              <Deferred
                icon={BookOpen}
                phase={4}
                title="Documentation"
                body="Installation guides, manuals, changelogs and PDF/ZIP documentation are managed in the Documentation CMS, delivered in Phase 4."
              />
              {continueFooter(5)}
            </div>
          )}
          {step === 6 && product && <LicenseSection productId={product.id} initial={licenseDefaults(product)} wizardStep={6} onSaved={next} footerStart={back} />}
          {step === 7 && product && (
            <SeoSection
              productId={product.id}
              initial={seoDefaults(product)}
              fallbackTitle={product.title || product.name}
              fallbackDescription={product.shortDescription}
              url={product.websiteUrl}
              wizardStep={7}
              onSaved={next}
              footerStart={back}
            />
          )}
          {step === 8 && product && (
            <div className="space-y-6">
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Product", `${product.name} · ${PRODUCT_TYPE_LABELS[product.productType]}`, 1],
                  ["Category", categories.find((c) => c.id === product.categoryId)?.name ?? "—", 1],
                  ["Version", `v${product.version}${product.releaseDate ? ` · released ${product.releaseDate}` : ""}`, 1],
                  ["Marketplace", marketplaces.find((m) => m.id === product.marketplaceId)?.name ?? "Not listed yet", 2],
                  ["Media", `${media.length} image(s)${product.thumbnailMediaId ? "" : " · no thumbnail"}${product.logoMediaId ? "" : " · no logo"}`, 3],
                  [
                    "Pricing",
                    product.pricing.regular
                      ? `${formatMoney(product.pricing.regular, product.pricing.currency)} regular${
                          product.pricing.extended ? ` · ${formatMoney(product.pricing.extended, product.pricing.currency)} extended` : ""
                        }`
                      : "Not set",
                    6,
                  ],
                  ["Support", `${product.supportDurationMonths} months`, 6],
                  ["SEO title", product.seo.title || "Not set", 7],
                ].map(([label, value, target]) => (
                  <div key={label as string} className="rounded-lg border p-3">
                    <dt className="flex items-center justify-between text-xs text-muted-foreground">
                      {label}
                      <button type="button" className="text-primary hover:underline" onClick={() => go(target as number)}>
                        Edit
                      </button>
                    </dt>
                    <dd className="mt-1 text-sm">{value}</dd>
                  </div>
                ))}
              </dl>

              {blockers.length > 0 ? (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <p className="text-sm font-medium">Complete these before publishing</p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                    {blockers.map((b) => (
                      <li key={b} className="flex items-center gap-2">
                        <CircleDashed className="size-3.5 text-warning" /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
                  <CheckCircle2 className="size-4 text-success" /> Everything needed to publish is in place.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                <div>{back}</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => finish("draft")} disabled={pending}>
                    Save as draft
                  </Button>
                  <Button variant="outline" onClick={() => finish("in_review")} disabled={pending}>
                    <Send /> Submit for review
                  </Button>
                  {canPublish && (
                    <Button onClick={() => finish("published")} disabled={pending || blockers.length > 0}>
                      {pending ? <Spinner /> : <CheckCircle2 />} Publish
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          {step > 1 && !product && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Start with <Link href="/products/new" className="text-primary hover:underline">basic information</Link>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
