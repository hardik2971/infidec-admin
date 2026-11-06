"use client";

import { ArrowLeftRight, Bug, ChevronRight, FileArchive, GitBranch, Plus, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VersionForm } from "@/components/packages/version-form";
import { VersionStatusBadge } from "@/components/packages/version-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { VersionRecord } from "@/lib/packages/schema";
import { cn } from "@/lib/utils";

export function VersionsBoard({
  products,
  selected,
  versions,
  suggestedVersion,
  canCreate,
}: {
  products: { id: string; name: string; currentVersion: string; versionCount: number }[];
  selected: { id: string; name: string; currentVersion: string } | null;
  versions: VersionRecord[];
  suggestedVersion: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [compareA, setCompareA] = useState(versions[1]?.id ?? "");
  const [compareB, setCompareB] = useState(versions[0]?.id ?? "");

  if (!selected) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitBranch />
          </EmptyMedia>
          <EmptyTitle>No products yet</EmptyTitle>
          <EmptyDescription>Add or import products first — versions belong to a product.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Products" className="space-y-1">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/versions?product=${p.id}`}
            className={cn(
              "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
              p.id === selected.id ? "border-primary/40 bg-accent shadow-xs" : "border-transparent hover:bg-muted/60",
            )}
            aria-current={p.id === selected.id ? "page" : undefined}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block font-mono text-xs text-muted-foreground">current v{p.currentVersion}</span>
            </span>
            <Badge variant="secondary" className="tabular">
              {p.versionCount}
            </Badge>
          </Link>
        ))}
      </nav>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <p className="text-sm text-muted-foreground">
              {versions.length} version{versions.length === 1 ? "" : "s"} · current published version{" "}
              <span className="font-mono">v{selected.currentVersion}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {versions.length >= 2 && (
              <div className="flex items-center gap-1.5 rounded-lg border bg-card p-1">
                <Select value={compareA} onValueChange={setCompareA}>
                  <SelectTrigger size="sm" className="h-7 w-24 border-0 font-mono text-xs shadow-none" aria-label="Compare from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="font-mono text-xs">
                        v{v.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ArrowLeftRight className="size-3.5 text-muted-foreground" />
                <Select value={compareB} onValueChange={setCompareB}>
                  <SelectTrigger size="sm" className="h-7 w-24 border-0 font-mono text-xs shadow-none" aria-label="Compare to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="font-mono text-xs">
                        v{v.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" className="h-7" disabled={!compareA || !compareB || compareA === compareB} asChild>
                  <Link href={`/versions/compare?a=${compareA}&b=${compareB}`}>Compare</Link>
                </Button>
              </div>
            )}
            {canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New version
              </Button>
            )}
          </div>
        </div>

        {versions.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitBranch />
              </EmptyMedia>
              <EmptyTitle>No versions for {selected.name}</EmptyTitle>
              <EmptyDescription>Create the first version — v{suggestedVersion} — then upload its source packages.</EmptyDescription>
            </EmptyHeader>
            {canCreate && (
              <EmptyContent>
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Create v{suggestedVersion}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ol className="relative space-y-3 before:absolute before:top-3 before:bottom-3 before:left-[1.1rem] before:w-px before:bg-border">
            {versions.map((v) => (
              <li key={v.id} className="relative pl-10">
                <span
                  className={cn(
                    "absolute top-4 left-2.5 size-3.5 rounded-full border-2 border-background ring-1",
                    v.status === "published" ? "bg-success ring-success/40" : v.status === "deprecated" ? "bg-muted-foreground/40 ring-border" : "bg-card ring-primary/50",
                  )}
                />
                <Link href={`/versions/${v.id}`} className="block">
                  <Card className={cn("gap-0 py-0 transition-shadow hover:shadow-md", v.status === "deprecated" && "opacity-70")}>
                    <CardContent className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-semibold">v{v.version}</span>
                          <VersionStatusBadge status={v.status} />
                          {v.version === selected.currentVersion && v.status === "published" && <Badge>Current</Badge>}
                          {v.title && <span className="truncate text-sm text-muted-foreground">{v.title}</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <FileArchive className="size-3.5" /> {v.packageCount} package{v.packageCount === 1 ? "" : "s"} · {formatBytes(v.packageBytes)}
                          </span>
                          {v.newFeatures.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className="size-3.5" /> {v.newFeatures.length} features
                            </span>
                          )}
                          {v.improvements.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Wrench className="size-3.5" /> {v.improvements.length} improvements
                            </span>
                          )}
                          {v.bugFixes.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Bug className="size-3.5" /> {v.bugFixes.length} fixes
                            </span>
                          )}
                          <span>{v.releaseDate ? `Released ${v.releaseDate}` : `Created ${formatDateTime(v.createdAt)}`}</span>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New version of {selected.name}</DialogTitle>
            <DialogDescription>Starts as a draft. Upload its packages, then publish it.</DialogDescription>
          </DialogHeader>
          <VersionForm
            productId={selected.id}
            suggested={suggestedVersion}
            onCancel={() => setCreating(false)}
            onSaved={(id) => {
              setCreating(false);
              router.push(`/versions/${id}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
