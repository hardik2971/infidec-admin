"use client";

import { ArrowDown, ArrowUp, ImagePlus, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMediaAction, reorderScreenshotsAction, updateMediaAltAction } from "@/app/(admin)/products/actions";
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
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/format";
import type { MediaKind, ProductMediaItem } from "@/lib/products/schema";
import { cn } from "@/lib/utils";

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 15 * 1024 * 1024;

type Upload = { name: string; progress: number; error?: string };

function uploadFile(productId: string, kind: MediaKind, file: File, onProgress: (p: number) => void) {
  return new Promise<{ ok: boolean; error?: string; duplicate?: boolean }>((resolve) => {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/products/${productId}/media`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, error: `Upload failed (HTTP ${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error during upload." });
    xhr.send(body);
  });
}

function MediaImage({ item, className }: { item: ProductMediaItem; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated media
    <img src={`/api/media/${item.id}`} alt={item.alt} loading="lazy" className={cn("bg-muted object-cover", className)} />
  );
}

function MediaSlot({
kind,
item,
title,
hint,
aspect,
readOnly,
busy,
pending,
onUpload,
onRemove,
}: {
kind: MediaKind;
item?: ProductMediaItem;
title: string;
hint: string;
aspect: string;
readOnly?: boolean;
busy: boolean;
pending: boolean;
onUpload: (kind: MediaKind, files: File[]) => void;
onRemove: (item: ProductMediaItem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {item && !readOnly && (
          <div className="flex gap-1">
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => input.current?.click()} aria-label={`Replace ${title}`} disabled={busy}>
              <RefreshCw />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => onRemove(item)} aria-label={`Remove ${title}`} disabled={pending}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onUpload(kind, [f]);
        }}
      />
      {item ? (
        <div className={cn("overflow-hidden rounded-xl border", aspect)}>
          <MediaImage item={item} className="size-full" />
        </div>
      ) : (
        <button
          type="button"
          disabled={readOnly || busy}
          onClick={() => input.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 disabled:pointer-events-none",
            aspect,
          )}
        >
          <ImagePlus className="size-5" />
          {readOnly ? "Not set" : `Upload ${title.toLowerCase()}`}
        </button>
      )}
      {item && (
        <p className="text-xs text-muted-foreground tabular">
          {item.width}×{item.height} · {formatBytes(item.size)}
        </p>
      )}
    </div>
  );
}


export function MediaManager({ productId, media, readOnly }: { productId: string; media: ProductMediaItem[]; readOnly?: boolean }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<ProductMediaItem | null>(null);
  const shotInput = useRef<HTMLInputElement>(null);

  const logo = media.find((m) => m.kind === "logo");
  const thumbnail = media.find((m) => m.kind === "thumbnail");
  const screenshots = media.filter((m) => m.kind === "screenshot").sort((a, b) => a.order - b.order);
  const busy = Object.values(uploads).some((u) => u.progress < 100 && !u.error);

  async function upload(kind: MediaKind, files: File[]) {
    const valid = files.filter((f) => {
      if (!ACCEPT.split(",").includes(f.type)) {
        toast.error(`${f.name}: only PNG, JPEG and WebP images are accepted.`);
        return false;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: images must be 15 MB or smaller.`);
        return false;
      }
      return true;
    });
    let added = 0;
    for (const file of valid) {
      const key = `${kind}:${file.name}:${file.size}:${Date.now()}`;
      setUploads((u) => ({ ...u, [key]: { name: file.name, progress: 0 } }));
      const res = await uploadFile(productId, kind, file, (progress) =>
        setUploads((u) => ({ ...u, [key]: { ...u[key], progress } })),
      );
      if (res.ok) {
        added++;
        if (res.duplicate) toast.info(`${file.name} is already in this product.`);
        setUploads((u) => {
          const next = { ...u };
          delete next[key];
          return next;
        });
      } else {
        setUploads((u) => ({ ...u, [key]: { name: file.name, progress: 100, error: res.error } }));
      }
    }
    if (added) {
      toast.success(added === 1 ? "Image uploaded." : `${added} images uploaded.`);
      router.refresh();
    }
  }

  function move(index: number, delta: number) {
    const ids = screenshots.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      const r = await reorderScreenshotsAction({ productId, orderedIds: ids });
      if (!r.ok) toast.error(r.error);
    });
  }

  function saveAlt(item: ProductMediaItem, alt: string) {
    if (alt.trim() === item.alt) return;
    startTransition(async () => {
      const r = await updateMediaAltAction({ productId, mediaId: item.id, alt });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  function remove(item: ProductMediaItem) {
    startTransition(async () => {
      const r = await deleteMediaAction({ productId, mediaId: item.id });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  const slotProps = { readOnly, busy, pending, onUpload: upload, onRemove: setRemoving };

  return (
    <div className="space-y-10">
      <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
        <MediaSlot kind="logo" item={logo} title="Logo" hint="Square, transparent PNG preferred" aspect="aspect-square" {...slotProps} />
        <MediaSlot kind="thumbnail" item={thumbnail} title="Thumbnail" hint="Cover image used in listings · 923×470 recommended" aspect="aspect-[923/470]" {...slotProps} />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Screenshots</h3>
            <p className="text-xs text-muted-foreground">
              {screenshots.length} image{screenshots.length === 1 ? "" : "s"} · shown in this order on product pages and listings
            </p>
          </div>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={() => shotInput.current?.click()} disabled={busy}>
              <UploadCloud /> Add screenshots
            </Button>
          )}
          <input
            ref={shotInput}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) upload("screenshot", files);
            }}
          />
        </div>

        {!readOnly && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = [...e.dataTransfer.files];
              if (files.length) upload("screenshot", files);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground transition-colors",
              dragOver && "border-primary bg-accent/50 text-accent-foreground",
            )}
          >
            <UploadCloud className="size-6" />
            <p>
              Drag &amp; drop screenshots here, or{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => shotInput.current?.click()}>
                browse
              </button>
            </p>
            <p className="text-xs">PNG, JPEG or WebP · up to 15 MB each</p>
          </div>
        )}

        {Object.entries(uploads).length > 0 && (
          <ul className="space-y-2">
            {Object.entries(uploads).map(([key, u]) => (
              <li key={key} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">{u.name}</span>
                  {u.error ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setUploads((all) => {
                          const next = { ...all };
                          delete next[key];
                          return next;
                        })
                      }
                    >
                      Dismiss
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground tabular">{u.progress}%</span>
                  )}
                </div>
                {u.error ? (
                  <p className="mt-1 text-xs text-destructive">{u.error}</p>
                ) : (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-brand-gradient transition-[width]" style={{ width: `${u.progress}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {screenshots.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {screenshots.map((s, i) => (
              <figure key={s.id} className="group overflow-hidden rounded-xl border bg-card">
                <div className="relative">
                  <MediaImage item={s} className="aspect-[16/10] w-full" />
                  <span className="absolute top-2 left-2 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular backdrop-blur">
                    {i + 1}
                  </span>
                  {s.section && (
                    <Badge variant="secondary" className="absolute top-2 right-2 bg-background/85 backdrop-blur">
                      {s.section}
                    </Badge>
                  )}
                </div>
                <figcaption className="space-y-2 p-3">
                  <Input
                    defaultValue={s.alt}
                    aria-label={`Alt text for screenshot ${i + 1}`}
                    placeholder="Describe this image"
                    className="h-8 text-xs"
                    disabled={readOnly}
                    onBlur={(e) => saveAlt(s, e.target.value)}
                  />
                  {!readOnly && (
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <Button type="button" size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label="Move earlier">
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => move(i, 1)}
                          disabled={i === screenshots.length - 1 || pending}
                          aria-label="Move later"
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular">
                        {s.width}×{s.height} · {formatBytes(s.size)}
                      </span>
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRemoving(s)} disabled={pending} aria-label="Remove screenshot">
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {pending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Saving…
          </p>
        )}
      </section>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this image?</AlertDialogTitle>
            <AlertDialogDescription>The file is deleted from Firebase Storage. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target) remove(target);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
