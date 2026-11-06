"use client";

import { Copy, Download, FileArchive, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { deletePackageAction, updatePackageAction } from "@/app/(admin)/packages/actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDateTime } from "@/lib/format";
import { PACKAGE_TYPE_LABELS, type PackageRecord } from "@/lib/packages/schema";
import { cn } from "@/lib/utils";
import { PackageUploader, type UploaderVersion } from "./package-uploader";

export interface PackageCaps {
  canUpload: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function PackagesTable({
  packages,
  productNames,
  versions,
  caps,
  maxUploadSizeMb,
  showProduct = true,
  emptyDescription,
  toolbar,
}: {
  packages: PackageRecord[];
  productNames: Record<string, string>;
  versions: UploaderVersion[];
  caps: PackageCaps;
  maxUploadSizeMb: number;
  showProduct?: boolean;
  emptyDescription?: string;
  toolbar?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<PackageRecord | null>(null);
  const [replacing, setReplacing] = useState<PackageRecord | null>(null);
  const [deleting, setDeleting] = useState<PackageRecord | null>(null);
  const [pending, startTransition] = useTransition();

  const columns = useMemo<DataTableColumn<PackageRecord>[]>(() => {
    const cols: DataTableColumn<PackageRecord>[] = [
      {
        accessorKey: "name",
        header: "Package",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className={cn("flex items-start gap-3", p.status !== "active" && "opacity-60")}>
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <FileArchive className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {p.name}
                  {p.status === "replaced" && <Badge variant="secondary">Replaced</Badge>}
                  {p.status === "deleted" && <Badge variant="outline" className="text-muted-foreground">Deleted</Badge>}
                </p>
                <p className="max-w-64 truncate font-mono text-xs text-muted-foreground">{p.fileName}</p>
                <Badge variant="outline" className="mt-1 text-[10.5px]">
                  {PACKAGE_TYPE_LABELS[p.packageType]}
                </Badge>
              </div>
            </div>
          );
        },
      },
    ];
    if (showProduct) {
      cols.push({
        accessorKey: "productId",
        header: "Product",
        cell: ({ row }) => (
          <Link href={`/products/${row.original.productId}?tab=packages`} className="text-sm hover:text-primary">
            {productNames[row.original.productId] ?? "Unknown product"}
          </Link>
        ),
      });
    }
    cols.push(
      {
        accessorKey: "version",
        header: "Version",
        cell: ({ row }) => (
          <Link href={`/versions/${row.original.versionId}`} className="font-mono text-xs hover:text-primary">
            v{row.original.version}
          </Link>
        ),
      },
      { accessorKey: "fileSize", header: "Size", cell: ({ row }) => <span className="text-sm tabular">{formatBytes(row.original.fileSize)}</span> },
      {
        accessorKey: "sha256",
        header: "SHA-256",
        enableSorting: false,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(row.original.sha256);
                  toast.success("Checksum copied.");
                }}
              >
                {row.original.sha256.slice(0, 12)}… <Copy className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-[11px]">{row.original.sha256}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Uploaded",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="tabular">{formatDateTime(row.original.createdAt)}</p>
            <p className="max-w-40 truncate text-muted-foreground">{row.original.uploadedByEmail}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          if (p.status === "deleted") return null;
          const active = p.status === "active";
          return (
            <div className="flex justify-end gap-1">
              {caps.canDownload && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="icon-sm" variant="ghost">
                      <a href={`/api/packages/${p.id}/download`} aria-label={`Download ${p.fileName}`}>
                        <Download />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download (short-lived secure link)</TooltipContent>
                </Tooltip>
              )}
              {(caps.canEdit || caps.canUpload || caps.canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${p.fileName}`} disabled={pending}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {caps.canEdit && (
                      <DropdownMenuItem onSelect={() => setEditing(p)}>
                        <Pencil /> Edit details
                      </DropdownMenuItem>
                    )}
                    {caps.canUpload && active && (
                      <DropdownMenuItem onSelect={() => setReplacing(p)}>
                        <RefreshCw /> Replace file
                      </DropdownMenuItem>
                    )}
                    {caps.canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        },
      },
    );
    return cols;
  }, [caps, pending, productNames, showProduct]);

  return (
    <>
      <DataTable
        columns={columns}
        data={packages}
        searchText={(p) => `${p.name} ${p.fileName} ${p.version} ${PACKAGE_TYPE_LABELS[p.packageType]} ${productNames[p.productId] ?? ""} ${p.sha256}`}
        searchPlaceholder="Search name, file, version or checksum…"
        emptyTitle="No packages yet"
        emptyDescription={emptyDescription}
        toolbar={toolbar}
      />

      <EditPackageDialog pkg={editing} onClose={() => setEditing(null)} />

      <Dialog open={!!replacing} onOpenChange={(o) => !o && setReplacing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Replace {replacing?.fileName}</DialogTitle>
            <DialogDescription>
              The new ZIP becomes the active {replacing ? PACKAGE_TYPE_LABELS[replacing.packageType] : ""} package for v{replacing?.version}. The current
              file is kept in the version history.
            </DialogDescription>
          </DialogHeader>
          {replacing && (
            <PackageUploader
              products={[]}
              versions={versions}
              replace={replacing}
              maxUploadSizeMb={maxUploadSizeMb}
              onFinished={() => setReplacing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.fileName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The ZIP is permanently removed from Firebase Storage. Its record (name, size and SHA-256) stays in the history for auditing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (target)
                  startTransition(async () => {
                    const r = await deletePackageAction(target.id);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  });
              }}
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditPackageDialog({ pkg, onClose }: { pkg: PackageRecord | null; onClose: () => void }) {
  return (
    <Dialog open={!!pkg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {pkg && <EditPackageForm key={pkg.id} pkg={pkg} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditPackageForm({ pkg, onClose }: { pkg: PackageRecord; onClose: () => void }) {
  const [name, setName] = useState(pkg.name);
  const [notes, setNotes] = useState(pkg.releaseNotes);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Package details</DialogTitle>
        <DialogDescription className="font-mono text-xs">{pkg.fileName}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Field>
          <FieldLabel htmlFor="pkg-name">Package name</FieldLabel>
          <Input id="pkg-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="pkg-notes">Release notes</FieldLabel>
          <Textarea id="pkg-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What's in this package?" />
        </Field>
        {pkg.zip && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">
              Archive contents · {pkg.zip.files.toLocaleString()} files · {formatBytes(pkg.zip.uncompressedBytes)}
            </p>
            <p className="font-mono">{pkg.zip.topLevel.slice(0, 12).join("  ")}</p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await updatePackageAction({ packageId: pkg.id, name, releaseNotes: notes });
              if (r.ok) {
                toast.success(r.message);
                onClose();
              } else toast.error(r.error);
            })
          }
        >
          {pending && <Spinner />} Save
        </Button>
      </DialogFooter>
    </>
  );
}
