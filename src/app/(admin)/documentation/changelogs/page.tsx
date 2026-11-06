import { Bug, GitBranch, Sparkles, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listVersions } from "@/lib/packages/versions";
import { listProducts } from "@/lib/products/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Changelogs" };

async function Changelogs({ searchParams }: { searchParams: PageProps<"/documentation/changelogs">["searchParams"] }) {
  await requirePermission("documentation:view");
  const sp = await searchParams;
  const [products, versions] = await Promise.all([listProducts(), listVersions()]);
  const active = products.filter((p) => p.status !== "archived");
  const product = active.find((p) => p.id === sp.product) ?? active[0];
  // Changelogs are generated from release notes of published (and deprecated) versions.
  const entries = versions.filter((v) => v.productId === product?.id && v.status !== "draft");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {active.map((p) => (
          <Link
            key={p.id}
            href={`/documentation/changelogs?product=${p.id}`}
            className={cn("rounded-lg border px-3 py-1.5 text-sm", p.id === product?.id ? "border-primary/40 bg-accent font-medium" : "hover:bg-muted")}
          >
            {p.name}
          </Link>
        ))}
      </div>
      {!entries.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranch />
            </EmptyMedia>
            <EmptyTitle>No released versions for {product?.name ?? "this product"}</EmptyTitle>
            <EmptyDescription>The changelog fills in automatically when versions are published in Version Management.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {entries.map((v) => (
            <Card key={v.id} className={v.status === "deprecated" ? "opacity-75" : ""}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/versions/${v.id}`} className="font-mono text-lg font-semibold hover:text-primary">
                    v{v.version}
                  </Link>
                  {v.title && <span className="font-medium">{v.title}</span>}
                  {v.status === "deprecated" && <Badge variant="secondary">Deprecated</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">{v.releaseDate || formatDateTime(v.publishedAt)}</span>
                </div>
                {v.releaseNotes && <Markdown>{v.releaseNotes}</Markdown>}
                <div className="grid gap-4 md:grid-cols-3">
                  {(
                    [
                      [Sparkles, "New", v.newFeatures],
                      [Wrench, "Improved", v.improvements],
                      [Bug, "Fixed", v.bugFixes],
                    ] as const
                  ).map(([Icon, label, items]) =>
                    items.length ? (
                      <div key={label}>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          <Icon className="size-3.5" /> {label}
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {items.map((i) => (
                            <li key={i}>{i}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChangelogsPage(props: PageProps<"/documentation/changelogs">) {
  return (
    <>
      <PageHeader title="Changelogs" description="Release history per product, generated from published version release notes." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Changelogs searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
