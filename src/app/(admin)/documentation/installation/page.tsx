import { CheckCircle2, CircleDashed, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { buildTree } from "@/lib/docs/schema";
import { listDocs } from "@/lib/docs/service";
import { listProducts } from "@/lib/products/service";

export const metadata: Metadata = { title: "Installation Guides" };

async function Guides() {
  await requirePermission("documentation:view");
  const [products, docs] = await Promise.all([listProducts(), listDocs()]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {products
        .filter((p) => p.status !== "archived")
        .map((p) => {
          const productDocs = docs.filter((d) => d.productId === p.id);
          const section = productDocs.find((d) => d.kind === "section" && /install/i.test(d.title));
          const pages = section ? (buildTree(productDocs).get(section.id) ?? []).filter((d) => d.kind === "page") : [];
          const done = pages.filter((d) => d.status === "published" && d.content.trim()).length;
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-[15px]">
                  {p.name}
                  {pages.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground tabular">
                      {done}/{pages.length} published
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {section ? `${section.title} section` : "No installation section yet — create the standard outline in the Documentation CMS."}
                </CardDescription>
                {pages.length > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(done / pages.length) * 100}%` }} />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {pages.length ? (
                  <ol className="space-y-1">
                    {pages.map((d, i) => {
                      const ready = d.status === "published" && d.content.trim();
                      return (
                        <li key={d.id}>
                          <Link href={`/documentation?product=${p.id}&doc=${d.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                            <span className="w-5 text-xs text-muted-foreground tabular">{i + 1}.</span>
                            {ready ? <CheckCircle2 className="size-4 text-success" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                            <span className="flex-1">{d.title}</span>
                            <span className="text-xs text-muted-foreground">{d.status === "published" ? (d.content.trim() ? "Published" : "Published · empty") : "Draft"}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <Link href={`/documentation?product=${p.id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <ListChecks className="size-4" /> Open in the Documentation CMS
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

export default function InstallationPage() {
  return (
    <>
      <PageHeader title="Installation Guides" description="Installation documentation for every product, in setup order, with what is still missing." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Guides />
      </Suspense>
    </>
  );
}
