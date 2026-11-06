"use client";

import { signInWithCustomToken, signOut } from "firebase/auth";
import { getStorage, ref, uploadBytesResumable, type UploadTask } from "firebase/storage";
import { CheckCircle2, FileArchive, Pause, Play, ShieldCheck, Trash2, UploadCloud, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { getClientAuth, getFirebaseApp } from "@/lib/firebase/client";
import { formatBytes } from "@/lib/format";
import { PACKAGE_TYPES, PACKAGE_TYPE_LABELS, VERSION_STATUS_LABELS, type PackageRecord, type PackageType, type VersionStatus } from "@/lib/packages/schema";
import { cn } from "@/lib/utils";

export interface UploaderVersion {
  id: string;
  productId: string;
  version: string;
  status: VersionStatus;
}

type Phase = "queued" | "uploading" | "paused" | "validating" | "done" | "failed" | "cancelled";
interface Item {
  key: string;
  file: File;
  name: string;
  packageType: PackageType;
  phase: Phase;
  progress: number;
  error?: string;
  result?: PackageRecord;
}

/** Best guess of the package type from the file name; staff can change it before uploading. */
function guessType(fileName: string): PackageType {
  const n = fileName.toLowerCase();
  if (/doc/.test(n)) return "documentation";
  if (/admin/.test(n)) return "admin_panel";
  if (/store|vendor|seller|restaurant/.test(n)) return "store_panel";
  if (/delivery|rider|driver|captain/.test(n)) return "delivery_app";
  if (/web(site)?|next/.test(n)) return "website";
  if (/backend|function|server|api|firebase/.test(n)) return "backend";
  if (/customer|user|app/.test(n)) return "customer_app";
  if (/module|addon|plugin/.test(n)) return "module";
  return "complete_source";
}

async function looksLikeZip(file: File) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05);
}

export function PackageUploader({
  products,
  versions,
  fixedProductId,
  fixedVersionId,
  replace,
  maxUploadSizeMb,
  onFinished,
}: {
  products: { id: string; name: string }[];
  versions: UploaderVersion[];
  fixedProductId?: string;
  fixedVersionId?: string;
  /** Replace mode: a single file that supersedes this package. */
  replace?: PackageRecord;
  maxUploadSizeMb: number;
  onFinished?: () => void;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(fixedProductId ?? replace?.productId ?? "");
  const [versionId, setVersionId] = useState(fixedVersionId ?? replace?.versionId ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const tasks = useRef(new Map<string, { task: UploadTask; uploadId: string }>());
  const input = useRef<HTMLInputElement>(null);

  const productVersions = versions.filter((v) => v.productId === productId && v.status !== "deprecated");
  const maxBytes = maxUploadSizeMb * 1024 * 1024;
  const update = (key: string, patch: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function addFiles(files: File[]) {
    const accepted: Item[] = [];
    for (const file of replace ? files.slice(0, 1) : files) {
      if (!/\.zip$/i.test(file.name)) {
        toast.error(`${file.name}: only .zip files are accepted.`);
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name} is ${formatBytes(file.size)} — the limit is ${maxUploadSizeMb} MB.`);
        continue;
      }
      if (!(await looksLikeZip(file))) {
        toast.error(`${file.name} doesn't look like a ZIP archive.`);
        continue;
      }
      const packageType = replace?.packageType ?? guessType(file.name);
      accepted.push({
        key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
        file,
        name: replace?.name ?? PACKAGE_TYPE_LABELS[packageType],
        packageType,
        phase: "queued",
        progress: 0,
      });
    }
    setItems((all) => (replace ? accepted : [...all, ...accepted]));
  }

  async function uploadOne(item: Item): Promise<boolean> {
    update(item.key, { phase: "uploading", progress: 0, error: undefined });
    const init = await fetch("/api/packages/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        versionId,
        packageType: item.packageType,
        name: item.name,
        releaseNotes: "",
        fileName: item.file.name,
        fileSize: item.file.size,
        replacesId: replace?.id ?? null,
      }),
    }).then((r) => r.json() as Promise<{ ok: boolean; error?: string; uploadId: string; stagingPath: string; token: string }>);
    if (!init.ok) {
      update(item.key, { phase: "failed", error: init.error });
      return false;
    }

    const auth = await getClientAuth();
    await signInWithCustomToken(auth, init.token);
    const task = uploadBytesResumable(ref(getStorage(getFirebaseApp()), init.stagingPath), item.file, { contentType: "application/zip" });
    tasks.current.set(item.key, { task, uploadId: init.uploadId });

    const uploaded = await new Promise<boolean>((resolve) => {
      task.on(
        "state_changed",
        (snap) =>
          update(item.key, {
            progress: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            phase: snap.state === "paused" ? "paused" : "uploading",
          }),
        (error) => {
          const cancelled = error.code === "storage/canceled";
          update(item.key, {
            phase: cancelled ? "cancelled" : "failed",
            error: cancelled
              ? undefined
              : error.code === "storage/unauthorized"
                ? "Storage refused the upload. Make sure storage.rules are deployed (npm run deploy:rules)."
                : error.message,
          });
          resolve(false);
        },
        () => resolve(true),
      );
    });
    tasks.current.delete(item.key);
    if (!uploaded) {
      await fetch(`/api/packages/uploads/${init.uploadId}`, { method: "DELETE" }).catch(() => {});
      return false;
    }

    update(item.key, { phase: "validating", progress: 100 });
    const done = await fetch(`/api/packages/uploads/${init.uploadId}`, { method: "POST" }).then(
      (r) => r.json() as Promise<{ ok: boolean; error?: string; package?: PackageRecord }>,
    );
    if (done.ok && done.package) {
      update(item.key, { phase: "done", result: done.package });
      return true;
    }
    update(item.key, { phase: "failed", error: done.error ?? "Validation failed." });
    return false;
  }

  async function start() {
    if (!productId || !versionId) {
      toast.error("Choose a product and version first.");
      return;
    }
    setRunning(true);
    const queue = items.filter((i) => i.phase === "queued" || i.phase === "failed");
    let ok = 0;
    for (const item of queue) {
      try {
        if (await uploadOne(item)) ok++;
      } catch (error) {
        update(item.key, { phase: "failed", error: (error as Error).message });
      }
    }
    await signOut(await getClientAuth()).catch(() => {});
    setRunning(false);
    router.refresh();
    if (ok) toast.success(replace ? "Package replaced." : `${ok} package${ok === 1 ? "" : "s"} uploaded and verified.`);
    if (ok === queue.length) onFinished?.();
  }

  const queued = items.filter((i) => i.phase === "queued" || i.phase === "failed").length;

  return (
    <div className="space-y-5">
      {!fixedProductId && !replace && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="up-product">Product</FieldLabel>
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                setVersionId("");
              }}
              disabled={running}
            >
              <SelectTrigger id="up-product" className="w-full">
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="up-version">Version</FieldLabel>
            <Select value={versionId} onValueChange={setVersionId} disabled={running || !productId}>
              <SelectTrigger id="up-version" className="w-full">
                <SelectValue placeholder={productId ? (productVersions.length ? "Choose a version" : "Create a version first") : "Choose a product first"} />
              </SelectTrigger>
              <SelectContent>
                {productVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version} · {VERSION_STATUS_LABELS[v.status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Packages belong to exactly one version of one product.</FieldDescription>
          </Field>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!running) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!running) addFiles([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
          dragOver ? "border-primary bg-accent/60" : "bg-muted/20",
        )}
      >
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
          <UploadCloud className="size-5" />
        </span>
        <p className="text-sm">
          {replace ? "Drop the replacement ZIP here, or " : "Drag & drop ZIP packages here, or "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => input.current?.click()} disabled={running}>
            browse files
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          .zip only · up to {maxUploadSizeMb >= 1024 ? `${(maxUploadSizeMb / 1024).toFixed(maxUploadSizeMb % 1024 ? 1 : 0)} GB` : `${maxUploadSizeMb} MB`} per file ·
          uploaded straight to private storage
        </p>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          multiple={!replace}
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            addFiles(files);
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const editable = (item.phase === "queued" || item.phase === "failed") && !running;
            return (
              <li key={item.key} className="rounded-xl border bg-card p-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <FileArchive className="mt-1 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <span className="text-xs text-muted-foreground tabular">{formatBytes(item.file.size)}</span>
                    </div>
                    {editable && !replace && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select
                          value={item.packageType}
                          onValueChange={(v) => update(item.key, { packageType: v as PackageType, name: PACKAGE_TYPE_LABELS[v as PackageType] })}
                        >
                          <SelectTrigger className="h-8 w-full text-xs" aria-label="Package type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PACKAGE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {PACKAGE_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input className="h-8 text-xs" value={item.name} onChange={(e) => update(item.key, { name: e.target.value })} aria-label="Package name" />
                      </div>
                    )}
                    {(item.phase === "uploading" || item.phase === "paused" || item.phase === "validating") && (
                      <div className="space-y-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-[width]", item.phase === "validating" ? "animate-pulse bg-chart-2" : "bg-brand-gradient")}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {item.phase === "validating" ? (
                            <>
                              <Spinner className="size-3" /> Checking ZIP integrity and computing SHA-256…
                            </>
                          ) : (
                            <span className="tabular">
                              {item.phase === "paused" ? "Paused · " : ""}
                              {item.progress}% of {formatBytes(item.file.size)}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {item.phase === "failed" && (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <XCircle className="mt-0.5 size-3.5 shrink-0" /> {item.error}
                      </p>
                    )}
                    {item.phase === "cancelled" && <p className="text-xs text-muted-foreground">Cancelled.</p>}
                    {item.phase === "done" && item.result && (
                      <div className="space-y-1 text-xs">
                        <p className="flex items-center gap-1.5 text-success">
                          <CheckCircle2 className="size-3.5" /> Verified and stored as {PACKAGE_TYPE_LABELS[item.result.packageType]} for v{item.result.version}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="size-3" /> SHA-256 <code className="font-mono">{item.result.sha256.slice(0, 16)}…</code>
                          </span>
                          {item.result.zip && (
                            <span className="tabular">
                              {item.result.zip.files.toLocaleString()} files · {formatBytes(item.result.zip.uncompressedBytes)} uncompressed
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.phase === "done" && <Badge variant="outline" className="border-success/40 text-success">Stored</Badge>}
                    {item.phase === "uploading" && (
                      <Button size="icon-sm" variant="ghost" aria-label="Pause upload" onClick={() => tasks.current.get(item.key)?.task.pause()}>
                        <Pause />
                      </Button>
                    )}
                    {item.phase === "paused" && (
                      <Button size="icon-sm" variant="ghost" aria-label="Resume upload" onClick={() => tasks.current.get(item.key)?.task.resume()}>
                        <Play />
                      </Button>
                    )}
                    {(item.phase === "uploading" || item.phase === "paused") && (
                      <Button size="icon-sm" variant="ghost" aria-label="Cancel upload" onClick={() => tasks.current.get(item.key)?.task.cancel()}>
                        <X />
                      </Button>
                    )}
                    {editable && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((all) => all.filter((i) => i.key !== item.key))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {queued > 0 && (
        <div className="flex justify-end">
          <Button onClick={start} disabled={running || !productId || !versionId}>
            {running ? <Spinner /> : <UploadCloud />}
            {replace ? "Upload replacement" : `Upload ${queued} package${queued === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
