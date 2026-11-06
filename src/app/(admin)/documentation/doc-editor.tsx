"use client";

import {
  Bold,
  CheckCircle2,
  Code2,
  Heading2,
  Heading3,
  History,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  RotateCcw,
  Save,
  Table2,
  Trash2,
  Undo2,
  Upload,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { docSchema, videoEmbedUrl, type DocRecord, type DocRevision } from "@/lib/docs/schema";
import { formatBytes, formatDateTime } from "@/lib/format";
import { slugify } from "@/lib/products/schema";
import { deleteDocAction, removeAttachmentAction, restoreRevisionAction, saveDocAction, setDocStatusAction } from "./actions";
import type { DocsCaps } from "./docs-workspace";

type Mode = "write" | "split" | "preview";

/** Wraps or prefixes the textarea selection with Markdown syntax. */
function applyFormat(el: HTMLTextAreaElement, value: string, kind: string): { next: string; cursor: [number, number] } {
  const [s, e] = [el.selectionStart, el.selectionEnd];
  const sel = value.slice(s, e);
  const wrap = (before: string, after: string, placeholder: string) => {
    const text = sel || placeholder;
    return { next: value.slice(0, s) + before + text + after + value.slice(e), cursor: [s + before.length, s + before.length + text.length] as [number, number] };
  };
  const linePrefix = (prefix: string) => {
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(lineStart, e) || "Item";
    const prefixed = block
      .split("\n")
      .map((l, i) => (prefix === "1. " ? `${i + 1}. ` : prefix) + l)
      .join("\n");
    return { next: value.slice(0, lineStart) + prefixed + value.slice(e), cursor: [lineStart, lineStart + prefixed.length] as [number, number] };
  };
  switch (kind) {
    case "bold":
      return wrap("**", "**", "bold text");
    case "italic":
      return wrap("_", "_", "italic text");
    case "h2":
      return linePrefix("## ");
    case "h3":
      return linePrefix("### ");
    case "ul":
      return linePrefix("- ");
    case "ol":
      return linePrefix("1. ");
    case "quote":
      return linePrefix("> ");
    case "link":
      return wrap("[", "](https://)", "link text");
    case "code":
      return wrap("\n```bash\n", "\n```\n", "npm install");
    case "table":
      return wrap("\n| Column | Description |\n| ------ | ----------- |\n| ", " | |\n", "Value");
    default:
      return { next: value, cursor: [s, e] };
  }
}

const TOOLS: [string, typeof Bold, string][] = [
  ["bold", Bold, "Bold"],
  ["italic", Italic, "Italic"],
  ["h2", Heading2, "Heading"],
  ["h3", Heading3, "Subheading"],
  ["ul", List, "Bulleted list"],
  ["ol", ListOrdered, "Numbered list"],
  ["quote", Quote, "Callout"],
  ["link", Link2, "Link"],
  ["code", Code2, "Code snippet"],
  ["table", Table2, "Table"],
];

export function DocEditor({ doc, revisions, caps, productId }: { doc: DocRecord; revisions: DocRevision[]; caps: DocsCaps; productId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [slug, setSlug] = useState(doc.slug);
  const [summary, setSummary] = useState(doc.summary);
  const [content, setContent] = useState(doc.content);
  const [videoUrl, setVideoUrl] = useState(doc.videoUrl);
  const [mode, setMode] = useState<Mode>(doc.kind === "page" ? "split" : "write");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewRev, setPreviewRev] = useState<DocRevision | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const readOnly = !caps.edit;

  const dirty = title !== doc.title || slug !== doc.slug || summary !== doc.summary || content !== doc.content || videoUrl !== doc.videoUrl;
  const values = { title, slug, summary, content, videoUrl };
  const validation = docSchema.safeParse(values);
  const embed = videoUrl ? videoEmbedUrl(videoUrl) : null;

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error);
    });
  }

  function format(kind: string) {
    const el = area.current;
    if (!el) return;
    const { next, cursor } = applyFormat(el, content, kind);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor[0], cursor[1]);
    });
  }

  async function uploadAttachment(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Attachments are limited to 50 MB.");
      return;
    }
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const r = await fetch(`/api/docs/${doc.id}/attachments`, { method: "POST", body }).then((x) => x.json() as Promise<{ ok: boolean; error?: string }>);
    setUploading(false);
    if (r.ok) {
      toast.success(`Attached ${file.name}.`);
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className={doc.status === "published" ? "border-success/40 text-success" : ""}>
              {doc.status === "published" ? "Published" : "Draft"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Revision {doc.revision} · saved {formatDateTime(doc.updatedAt)}
              {doc.updatedByEmail && ` by ${doc.updatedByEmail}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History /> History ({revisions.length})
            </Button>
            {caps.remove && (
              <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            )}
            {caps.publish &&
              (doc.status === "published" ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setDocStatusAction({ id: doc.id, status: "draft" }))}>
                  <Undo2 /> Unpublish
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" disabled={pending || dirty} onClick={() => run(() => setDocStatusAction({ id: doc.id, status: "published" }))}>
                        <CheckCircle2 /> Publish
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {dirty && <TooltipContent>Save your changes first.</TooltipContent>}
                </Tooltip>
              ))}
            {caps.edit && (
              <Button size="sm" disabled={pending || !dirty || !validation.success} onClick={() => run(() => saveDocAction({ id: doc.id, values }))}>
                {pending ? <Spinner /> : <Save />} Save
              </Button>
            )}
          </div>
        </div>

        <CardContent className="space-y-5 px-5 py-5">
          <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
            <Field>
              <FieldLabel htmlFor="doc-title">Title</FieldLabel>
              <Input
                id="doc-title"
                value={title}
                disabled={readOnly}
                className="text-base font-medium"
                onChange={(e) => {
                  if (slug === slugify(title)) setSlug(slugify(e.target.value));
                  setTitle(e.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="doc-slug">Slug</FieldLabel>
              <Input id="doc-slug" value={slug} disabled={readOnly} className="font-mono text-sm" onChange={(e) => setSlug(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="doc-summary">Summary</FieldLabel>
            <Input id="doc-summary" value={summary} disabled={readOnly} placeholder="One line shown in navigation and search" onChange={(e) => setSummary(e.target.value)} />
          </Field>
          {!validation.success && dirty && <p className="text-sm text-destructive">{validation.error.issues[0]?.message}</p>}

          {doc.kind === "page" && (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5" role="toolbar" aria-label="Formatting">
                    {TOOLS.map(([kind, Icon, label]) => (
                      <Tooltip key={kind}>
                        <TooltipTrigger asChild>
                          <Button type="button" size="icon-sm" variant="ghost" disabled={readOnly || mode === "preview"} onClick={() => format(kind)} aria-label={label}>
                            <Icon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{label}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <TabsList>
                      <TabsTrigger value="write">Write</TabsTrigger>
                      <TabsTrigger value="split">Split</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className={mode === "split" ? "grid gap-4 xl:grid-cols-2" : ""}>
                  {mode !== "preview" && (
                    <Textarea
                      ref={area}
                      value={content}
                      disabled={readOnly}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                          e.preventDefault();
                          if (dirty && validation.success) run(() => saveDocAction({ id: doc.id, values }));
                        }
                      }}
                      rows={24}
                      spellCheck
                      className="min-h-[28rem] font-mono text-[13px] leading-6"
                      placeholder={"## Overview\n\nWrite in Markdown. Use the toolbar for headings, lists, code snippets and tables."}
                      aria-label="Content (Markdown)"
                    />
                  )}
                  {mode !== "write" && (
                    <div className="min-h-[28rem] overflow-auto rounded-lg border bg-card px-6 py-5">
                      {content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Markdown with tables and code blocks. Raw HTML is not rendered. Ctrl/⌘+S saves.</p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="doc-video" className="flex items-center gap-1.5">
                    <Video className="size-4" /> Video tutorial
                  </FieldLabel>
                  <Input id="doc-video" value={videoUrl} disabled={readOnly} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setVideoUrl(e.target.value)} />
                  <FieldDescription>YouTube, Vimeo or Loom. Embedded at the top of the page.</FieldDescription>
                  {embed && (
                    <div className="mt-2 aspect-video overflow-hidden rounded-lg border">
                      <iframe src={embed} title="Video preview" className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" />
                    </div>
                  )}
                </Field>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Paperclip className="size-4" /> Attachments
                    </p>
                    {caps.upload && (
                      <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                        {uploading ? <Spinner /> : <Upload />} PDF or ZIP
                      </Button>
                    )}
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".pdf,.zip,application/pdf,application/zip"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) uploadAttachment(f);
                      }}
                    />
                  </div>
                  {doc.attachments.length ? (
                    <ul className="divide-y rounded-lg border">
                      {doc.attachments.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <a href={`/api/docs/${doc.id}/attachments/${a.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary" target="_blank" rel="noreferrer">
                            {a.fileName}
                          </a>
                          <span className="text-xs text-muted-foreground tabular">{formatBytes(a.size)}</span>
                          {caps.edit && (
                            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${a.fileName}`} onClick={() => run(() => removeAttachmentAction({ id: doc.id, attachmentId: a.id }))}>
                              <Trash2 />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">PDF manuals and ZIP bundles (≤ 50 MB) stored privately.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Version history</SheetTitle>
            <SheetDescription>The last {revisions.length} saved versions of “{doc.title}”. Restoring keeps the current text as a new revision.</SheetDescription>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-4 pb-4 md:grid-cols-[12rem_1fr]">
            <ul className="space-y-1 overflow-y-auto">
              {revisions.length === 0 && <li className="text-sm text-muted-foreground">No earlier versions yet.</li>}
              {revisions.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setPreviewRev(r)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${previewRev?.id === r.id ? "border-primary/40 bg-accent" : "border-transparent hover:bg-muted"}`}
                  >
                    <p className="font-medium">Revision {r.revision}</p>
                    <p className="text-muted-foreground">{formatDateTime(r.savedAt)}</p>
                    <p className="truncate text-muted-foreground">{r.savedByEmail}</p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-h-0 overflow-y-auto rounded-lg border p-4">
              {previewRev ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-medium">{previewRev.title}</p>
                    {caps.edit && (
                      <Button size="sm" disabled={pending} onClick={() => run(() => restoreRevisionAction({ id: doc.id, revisionId: previewRev.id }), () => setHistoryOpen(false))}>
                        <RotateCcw /> Restore
                      </Button>
                    )}
                  </div>
                  <Markdown>{previewRev.content || "_Empty_"}</Markdown>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a revision to preview it.</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The {doc.kind}, its history and its attachments are removed permanently.{doc.kind === "section" && " Sections must be empty first."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => deleteDocAction(doc.id), () => router.push(`/documentation?product=${productId}`))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
