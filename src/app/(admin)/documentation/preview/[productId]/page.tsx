import { ArrowLeft, BookOpen, Paperclip } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { buildTree, videoEmbedUrl, type DocRecord } from "@/lib/docs/schema";
import { listDocs } from "@/lib/docs/service";
import { formatBytes } from "@/lib/format";
import { getProduct } from "@/lib/products/service";
import { cn } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Documentation preview" };

function DocBody({ doc }: { doc: DocRecord }) {
  const embed = doc.videoUrl ? videoEmbedUrl(doc.videoUrl) : null;
  return (
    <article className="break-inside-avoid-page">
      <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
      {doc.summary && <p className="mt-2 text-lg text-muted-foreground">{doc.summary}</p>}
      {embed && (
        <div className="mt-6 aspect-video overflow-hidden rounded-xl border print:hidden">
          <iframe src={embed} title={`${doc.title} video`} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" />
        </div>
      )}
      {doc.videoUrl && <p className="hidden text-sm print:block">Video tutorial: {doc.videoUrl}</p>}
      <div className="mt-6">{doc.content.trim() ? <Markdown>{doc.content}</Markdown> : <p className="text-muted-foreground italic">This page has no content yet.</p>}</div>
      {doc.attachments.length > 0 && (
        <div className="mt-8 rounded-xl border p-4 print:hidden">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Paperclip className="size-4" /> Downloads
          </p>
          <ul className="space-y-1 text-sm">
            {doc.attachments.map((a) => (
              <li key={a.id}>
                <a href={`/api/docs/${doc.id}/attachments/${a.id}`} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                  {a.fileName}
                </a>{" "}
                <span className="text-muted-foreground">({formatBytes(a.size)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

async function Preview({ params, searchParams }: PageProps<"/documentation/preview/[productId]">) {
  await requirePermission("documentation:view");
  const { productId } = await params;
  const sp = await searchParams;
  const product = await getProduct(productId);
  if (!product) notFound();
  // Only published content is visible publicly — and therefore in this preview.
  const all = await listDocs(productId);
  const published = all.filter((d) => d.status === "published");
  const visible = published.filter((d) => {
    let parent = d.parentId;
    while (parent) {
      const p = all.find((x) => x.id === parent);
      if (!p || p.status !== "published") return false;
      parent = p.parentId;
    }
    return true;
  });
  const tree = buildTree(visible);
  const ordered: DocRecord[] = [];
  const walk = (parent: string | null) => (tree.get(parent) ?? []).forEach((d) => (ordered.push(d), walk(d.id)));
  walk(null);
  const pages = ordered.filter((d) => d.kind === "page");
  const printAll = sp.print === "all";
  const current = pages.find((d) => d.slug === sp.page) ?? pages[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/documentation?product=${productId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the editor
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {pages.length} published page{pages.length === 1 ? "" : "s"} · {all.filter((d) => d.kind === "page").length - pages.length} drafts hidden
          </Badge>
          {printAll ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/documentation/preview/${productId}`}>Back to preview</Link>
              </Button>
              <PrintButton />
            </>
          ) : (
            <Button asChild size="sm" disabled={!pages.length}>
              <Link href={`/documentation/preview/${productId}?print=all`}>Export PDF</Link>
            </Button>
          )}
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <BookOpen className="size-6 text-muted-foreground" />
          <p className="font-medium">Nothing is published yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Publish pages (and the sections that contain them) in the Documentation CMS to see them here.</p>
        </div>
      ) : printAll ? (
        <div className="mx-auto max-w-3xl space-y-14 rounded-xl border bg-card px-10 py-10 print:max-w-none print:border-0 print:p-0">
          <header className="border-b pb-6">
            <p className="text-sm tracking-widest text-muted-foreground uppercase">INFIDEC Documentation</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{product.name}</h1>
            <p className="mt-2 text-muted-foreground">Version {product.version}</p>
            <ol className="mt-6 list-decimal space-y-0.5 pl-5 text-sm">
              {pages.map((p) => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ol>
          </header>
          {pages.map((p) => (
            <div key={p.id} className="print:break-before-page">
              <DocBody doc={p} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-8 overflow-hidden rounded-xl border bg-card lg:grid-cols-[16rem_1fr]">
          <nav aria-label="Documentation" className="border-b bg-muted/30 p-4 lg:border-r lg:border-b-0">
            <p className="mb-3 px-2 text-sm font-semibold">{product.name} Docs</p>
            <ul className="space-y-0.5 text-sm">
              {ordered.map((d) =>
                d.kind === "section" ? (
                  <li key={d.id} className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase first:pt-0">
                    {d.title}
                  </li>
                ) : (
                  <li key={d.id}>
                    <Link
                      href={`/documentation/preview/${productId}?page=${d.slug}`}
                      className={cn("block rounded-md px-2 py-1.5", current?.id === d.id ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted")}
                    >
                      {d.title}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
          <div className="min-w-0 px-6 py-8 lg:px-10">{current && <DocBody doc={current} />}</div>
        </div>
      )}
    </div>
  );
}

export default function PreviewPage(props: PageProps<"/documentation/preview/[productId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
      <Preview {...props} />
    </Suspense>
  );
}
