"use client";

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  LayoutTemplate,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { buildTree, type DocRecord, type DocRevision } from "@/lib/docs/schema";
import { cn } from "@/lib/utils";
import { createDocAction, createOutlineAction, moveDocAction } from "./actions";
import { DocEditor } from "./doc-editor";

export interface DocsCaps {
  create: boolean;
  edit: boolean;
  publish: boolean;
  remove: boolean;
  upload: boolean;
}

type NewDoc = { kind: "section" | "page"; parentId: string | null } | null;

export function DocsWorkspace({
  products,
  productId,
  docs,
  selected,
  revisions,
  caps,
}: {
  products: { id: string; name: string }[];
  productId: string | null;
  docs: DocRecord[];
  selected: DocRecord | null;
  revisions: DocRevision[];
  caps: DocsCaps;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newDoc, setNewDoc] = useState<NewDoc>(null);
  const [newTitle, setNewTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const tree = buildTree(docs);
  const open = (id: string) => router.push(`/documentation?product=${productId}&doc=${id}`, { scroll: false });

  if (!productId) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpen />
          </EmptyMedia>
          <EmptyTitle>No products yet</EmptyTitle>
          <EmptyDescription>Documentation belongs to a product. Add or import products first.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function create() {
    if (!newDoc) return;
    startTransition(async () => {
      const r = await createDocAction({ productId: productId!, ...newDoc, title: newTitle });
      if (r.ok) {
        setNewDoc(null);
        setNewTitle("");
        open(r.id);
      } else toast.error(r.error);
    });
  }

  /** Drop `dragId` before `targetId` (same or different parent). */
  function drop(target: DocRecord) {
    const moving = docs.find((d) => d.id === dragId);
    setDragId(null);
    if (!moving || moving.id === target.id || !caps.edit) return;
    const siblings = (tree.get(target.parentId) ?? []).map((d) => d.id).filter((id) => id !== moving.id);
    siblings.splice(siblings.indexOf(target.id), 0, moving.id);
    startTransition(async () => {
      const r = await moveDocAction({ id: moving.id, parentId: target.parentId, orderedSiblingIds: siblings });
      if (!r.ok) toast.error(r.error);
    });
  }

  function renderNodes(parentId: string | null, depth: number): React.ReactNode {
    return (tree.get(parentId) ?? []).map((d) => {
      const children = tree.get(d.id) ?? [];
      const isCollapsed = collapsed.has(d.id);
      return (
        <li key={d.id}>
          <div
            draggable={caps.edit}
            onDragStart={() => setDragId(d.id)}
            onDragOver={(e) => caps.edit && dragId && e.preventDefault()}
            onDrop={() => drop(d)}
            className={cn(
              "group flex items-center gap-1 rounded-md py-1 pr-1.5 text-sm transition-colors",
              selected?.id === d.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
              dragId === d.id && "opacity-40",
            )}
            style={{ paddingLeft: depth * 14 + 4 }}
          >
            {caps.edit && <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/40 opacity-0 group-hover:opacity-100" />}
            {d.kind === "section" ? (
              <button
                type="button"
                className="shrink-0 text-muted-foreground"
                onClick={() =>
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(d.id)) next.delete(d.id);
                    else next.add(d.id);
                    return next;
                  })
                }
                aria-label={isCollapsed ? `Expand ${d.title}` : `Collapse ${d.title}`}
              >
                {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <button type="button" onClick={() => open(d.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              {d.kind === "section" ? <Folder className="size-3.5 shrink-0 text-primary" /> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className={cn("truncate", d.kind === "section" && "font-medium")}>{d.title}</span>
              {d.status === "published" ? (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-success" aria-label="Published" />
              ) : (
                <span className="ml-auto size-1.5 shrink-0 rounded-full border border-muted-foreground/50" aria-label="Draft" />
              )}
            </button>
            {d.kind === "section" && caps.create && (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                aria-label={`Add page to ${d.title}`}
                onClick={() => setNewDoc({ kind: "page", parentId: d.id })}
              >
                <FilePlus2 className="size-3.5" />
              </button>
            )}
          </div>
          {children.length > 0 && !isCollapsed && <ul>{renderNodes(d.id, depth + 1)}</ul>}
        </li>
      );
    });
  }

  const published = docs.filter((d) => d.status === "published" && d.kind === "page").length;
  const pages = docs.filter((d) => d.kind === "page").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
      <Card className="gap-3 py-4 lg:sticky lg:top-20 lg:max-h-[calc(100svh-7rem)] lg:self-start">
        <CardContent className="flex min-h-0 flex-col gap-3 px-3">
          <Select value={productId} onValueChange={(v) => router.push(`/documentation?product=${v}`)}>
            <SelectTrigger className="w-full" aria-label="Product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span className="tabular">
              {published}/{pages} pages published
            </span>
            {pending && <Spinner className="size-3" />}
          </div>
          {caps.create && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setNewDoc({ kind: "section", parentId: null })}>
                <FolderPlus /> Section
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setNewDoc({ kind: "page", parentId: selected?.kind === "section" ? selected.id : (selected?.parentId ?? null) })}>
                <FilePlus2 /> Page
              </Button>
            </div>
          )}
          <nav aria-label="Documentation tree" className="-mx-1 min-h-0 overflow-y-auto">
            {docs.length ? (
              <ul className="space-y-0.5">{renderNodes(null, 0)}</ul>
            ) : (
              <p className="px-2 py-4 text-sm text-muted-foreground">No documentation yet.</p>
            )}
          </nav>
          {caps.create && (
            <Button
              size="sm"
              variant="ghost"
              className="justify-start text-muted-foreground"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await createOutlineAction(productId);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.error);
                })
              }
            >
              <LayoutTemplate /> {docs.length ? "Add missing standard pages" : "Create standard outline"}
            </Button>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <DocEditor doc={selected} revisions={revisions} caps={caps} productId={productId} />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>{docs.length ? "Select a page to edit" : "Start this product's documentation"}</EmptyTitle>
            <EmptyDescription>
              {docs.length
                ? "Choose a page or section from the tree. Drag items to reorder them."
                : "Create the standard outline — Getting Started, Installation, Configuration, Modules and Developer Documentation — as draft pages to fill in."}
            </EmptyDescription>
          </EmptyHeader>
          {!docs.length && caps.create && (
            <EmptyContent>
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await createOutlineAction(productId);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  })
                }
              >
                {pending ? <Spinner /> : <LayoutTemplate />} Create standard outline
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      <Dialog open={!!newDoc} onOpenChange={(o) => !o && setNewDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New {newDoc?.kind}</DialogTitle>
            <DialogDescription>
              {newDoc?.parentId ? `Inside “${docs.find((d) => d.id === newDoc.parentId)?.title}”.` : "At the top level."} It starts as a draft.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <Input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={newDoc?.kind === "section" ? "e.g. Installation" : "e.g. Firebase Setup"} aria-label="Title" />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDoc(null)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending || newTitle.trim().length < 2}>
              {pending && <Spinner />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
