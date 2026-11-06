"use client";

import { ArrowLeft, Check, CheckCircle2, Circle, ExternalLink, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { LISTING_NEXT, LISTING_STATUS_LABELS, MANUAL_CHECKS, readiness, type ListingRecord, type ListingStatus, type ListingValues } from "@/lib/listings/schema";
import { PACKAGE_TYPE_LABELS, type PackageType } from "@/lib/packages/schema";
import { cn } from "@/lib/utils";
import { deleteListingAction, saveListingAction, transitionListingAction } from "../actions";

const NONE = "__none__";

export function ListingEditor({
  listing,
  productName,
  versions,
  packages,
  media,
  caps,
}: {
  listing: ListingRecord;
  productName: string;
  versions: { id: string; version: string; status: string }[];
  packages: { id: string; versionId: string; name: string; fileName: string; type: PackageType }[];
  media: { id: string; kind: string; alt: string }[];
  caps: { edit: boolean; submit: boolean; approve: boolean; remove: boolean };
}) {
  const router = useRouter();
  const [initial] = useState<ListingValues>(() => ({
    itemTitle: listing.itemTitle,
    description: listing.description,
    category: listing.category,
    tags: listing.tags,
    versionId: listing.versionId,
    liveDemoUrl: listing.liveDemoUrl,
    sourcePackageId: listing.sourcePackageId,
    documentationPackageId: listing.documentationPackageId,
    thumbnailMediaId: listing.thumbnailMediaId,
    screenshotMediaIds: listing.screenshotMediaIds,
    changelog: listing.changelog,
    requirements: listing.requirements,
    checklist: listing.checklist,
  }));
  const [v, setV] = useState<ListingValues>(initial);
  const [acting, setActing] = useState<ListingStatus | null>(null);
  const [note, setNote] = useState("");
  const [itemId, setItemId] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const editable = caps.edit && ["draft", "ready", "rejected"].includes(listing.status);
  const r = readiness(v);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof ListingValues>(k: K, val: ListingValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const versionPackages = packages.filter((p) => !v.versionId || p.versionId === v.versionId);
  const canMove = (s: ListingStatus) => (s === "approved" || s === "published" ? caps.approve : s === "submitted" ? caps.submit : caps.edit);

  const pick = (label: string, value: string, onChange: (x: string) => void, items: { value: string; label: string }[]) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value || NONE} onValueChange={(x) => onChange(x === NONE ? "" : x)} disabled={!editable}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not selected</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <div className="space-y-5">
      <Link href="/products/listings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Marketplace listings
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{listing.itemTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {productName} · {listing.marketplaceId === "envato" ? "CodeCanyon" : listing.marketplaceId}
            {listing.resubmissions > 0 && ` · resubmission ${listing.resubmissions}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ListingStatusBadge status={listing.status} />
          {listing.itemUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={listing.itemUrl} target="_blank" rel="noreferrer">
                Item #{listing.itemId} <ExternalLink />
              </a>
            </Button>
          )}
          {LISTING_NEXT[listing.status].filter(canMove).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "rejected" || s === "draft" ? "outline" : "default"}
              disabled={pending || (s === "ready" && (!r.ready || dirty))}
              onClick={() => {
                setNote("");
                setActing(s);
              }}
            >
              {s === "draft" && listing.status === "rejected" ? "Revise & resubmit" : s === "draft" ? "Back to draft" : `Mark ${LISTING_STATUS_LABELS[s].toLowerCase()}`}
            </Button>
          ))}
          {caps.remove && listing.status === "draft" && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete submission"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteListingAction(listing.id);
                  if (res.ok) {
                    toast.success(res.message);
                    router.push("/products/listings");
                  } else toast.error(res.error);
                })
              }
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {listing.status === "rejected" && listing.rejectionNotes && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Reviewer feedback</p>
          <p className="mt-1 whitespace-pre-wrap">{listing.rejectionNotes}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="l-title">Item title</FieldLabel>
                  <span className={cn("text-xs tabular", v.itemTitle.length > 100 ? "text-destructive" : "text-muted-foreground")}>{v.itemTitle.length}/100</span>
                </div>
                <Input id="l-title" value={v.itemTitle} disabled={!editable} onChange={(e) => set("itemTitle", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-cat">Marketplace category</FieldLabel>
                <Input id="l-cat" value={v.category} disabled={!editable} placeholder="e.g. Mobile / Full Applications" onChange={(e) => set("category", e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="l-desc">Description</FieldLabel>
              <Textarea id="l-desc" rows={8} value={v.description} disabled={!editable} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="l-tags">Tags</FieldLabel>
              <TagInput id="l-tags" value={v.tags} onChange={(t) => set("tags", t)} max={15} disabled={!editable} placeholder="grocery app, flutter…" />
              <FieldDescription>Up to 15.</FieldDescription>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              {pick("Item version", v.versionId, (x) => setV((s) => ({ ...s, versionId: x, sourcePackageId: "", documentationPackageId: "" })), versions.map((x) => ({ value: x.id, label: `v${x.version} (${x.status})` })))}
              <Field>
                <FieldLabel htmlFor="l-demo">Live demo URL</FieldLabel>
                <Input id="l-demo" value={v.liveDemoUrl} disabled={!editable} placeholder="https://" onChange={(e) => set("liveDemoUrl", e.target.value)} />
              </Field>
              {pick("Source code ZIP", v.sourcePackageId, (x) => set("sourcePackageId", x), versionPackages.map((p) => ({ value: p.id, label: `${p.name} · ${p.fileName}` })))}
              {pick(
                "Documentation",
                v.documentationPackageId,
                (x) => set("documentationPackageId", x),
                versionPackages.filter((p) => p.type === "documentation" || p.type === "complete_source").map((p) => ({ value: p.id, label: `${PACKAGE_TYPE_LABELS[p.type]} · ${p.fileName}` })),
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Thumbnail &amp; screenshots</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {media.map((m) => {
                  const isThumb = v.thumbnailMediaId === m.id;
                  const isShot = v.screenshotMediaIds.includes(m.id);
                  return (
                    <div key={m.id} className={cn("overflow-hidden rounded-lg border", (isThumb || isShot) && "ring-2 ring-primary")}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated media */}
                      <img src={`/api/media/${m.id}`} alt={m.alt} loading="lazy" className="aspect-[16/10] w-full bg-muted object-cover" />
                      <div className="flex items-center justify-between gap-1 px-1.5 py-1 text-[10px]">
                        <button type="button" disabled={!editable} className={cn("rounded px-1", isThumb ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => set("thumbnailMediaId", isThumb ? "" : m.id)}>
                          Preview
                        </button>
                        <button
                          type="button"
                          disabled={!editable}
                          className={cn("rounded px-1", isShot ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                          onClick={() => set("screenshotMediaIds", isShot ? v.screenshotMediaIds.filter((x) => x !== m.id) : [...v.screenshotMediaIds, m.id])}
                        >
                          Screenshot
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!media.length && <p className="text-xs text-muted-foreground">Add images to the product first (Product → Media).</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="l-changelog">Changelog</FieldLabel>
                <Textarea id="l-changelog" rows={6} className="font-mono text-xs" value={v.changelog} disabled={!editable} onChange={(e) => set("changelog", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-req">Requirements</FieldLabel>
                <Textarea id="l-req" rows={6} value={v.requirements} disabled={!editable} onChange={(e) => set("requirements", e.target.value)} />
              </Field>
            </div>

            {editable && (
              <div className="flex justify-end border-t pt-5">
                <Button
                  disabled={pending || !dirty}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await saveListingAction({ id: listing.id, values: v });
                      if (res.ok) toast.success(res.message);
                      else toast.error(res.error);
                    })
                  }
                >
                  {pending ? <Spinner /> : <Save />} Save submission
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-[15px]">
                Submission checklist
                <span className="text-xs font-normal text-muted-foreground tabular">
                  {r.done}/{r.total}
                </span>
              </CardTitle>
              <CardDescription>All items must be complete before marking it ready.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {r.auto.map((c) => (
                <p key={c.key} className="flex items-center gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground/50" />}
                  <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                </p>
              ))}
              <div className="my-2 border-t" />
              {MANUAL_CHECKS.map(([key, label]) => (
                <Label key={key} className="flex items-start gap-2 text-sm font-normal">
                  <Checkbox className="mt-0.5" checked={!!v.checklist[key]} disabled={!editable} onCheckedChange={(c) => set("checklist", { ...v.checklist, [key]: c === true })} />
                  {label}
                </Label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 border-l pl-3">
                {[...listing.history].reverse().map((h, i) => (
                  <li key={i} className="text-xs">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Check className="size-3 text-primary" /> {LISTING_STATUS_LABELS[h.status]}
                    </p>
                    <p className="text-muted-foreground">
                      {formatDateTime(h.at)} · {h.byEmail}
                    </p>
                    {h.note && <p className="mt-0.5 whitespace-pre-wrap">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!acting} onOpenChange={(o) => !o && setActing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{acting && `Mark ${LISTING_STATUS_LABELS[acting].toLowerCase()}`}</DialogTitle>
            <DialogDescription>
              {acting === "rejected"
                ? "Paste the reviewer's feedback — it's kept with the submission history."
                : acting === "published"
                  ? "Enter the item ID and URL from the marketplace. They're saved to the product so purchase codes match automatically."
                  : acting === "submitted"
                    ? "Confirm you've uploaded this submission on the marketplace."
                    : "Add an optional note."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {acting === "published" && (
              <>
                <Input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Item ID, e.g. 51234567" className="font-mono" aria-label="Item ID" />
                <Input value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} placeholder="https://codecanyon.net/item/…" aria-label="Item URL" />
              </>
            )}
            <Textarea rows={acting === "rejected" ? 6 : 3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={acting === "rejected" ? "Reviewer feedback" : "Note"} aria-label="Note" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActing(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                acting &&
                startTransition(async () => {
                  const res = await transitionListingAction({ id: listing.id, status: acting, note, itemId: itemId || undefined, itemUrl: itemUrl || undefined });
                  if (res.ok) {
                    toast.success(res.message);
                    setActing(null);
                  } else toast.error(res.error);
                })
              }
            >
              {pending && <Spinner />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
