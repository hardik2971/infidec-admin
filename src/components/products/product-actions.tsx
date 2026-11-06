"use client";

import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  Eye,
  MoreHorizontal,
  Pause,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteProductAction,
  duplicateProductAction,
  setProductStatusAction,
} from "@/app/(admin)/products/actions";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProductStatus } from "@/lib/products/schema";

export interface ProductCapabilities {
  canEdit: boolean;
  canCreate: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

type Confirm = { kind: "delete" } | { kind: "status"; status: ProductStatus; title: string; body: string } | null;

export function ProductActions({
  product,
  caps,
  showEdit = true,
  trigger = "icon",
}: {
  product: { id: string; name: string; status: ProductStatus };
  caps: ProductCapabilities;
  showEdit?: boolean;
  trigger?: "icon" | "button";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const { status } = product;

  function changeStatus(next: ProductStatus) {
    startTransition(async () => {
      const r = await setProductStatusAction({ productId: product.id, status: next });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  function duplicate() {
    startTransition(async () => {
      const r = await duplicateProductAction(product.id);
      if (r.ok) {
        toast.success(r.message, { action: { label: "Open", onClick: () => router.push(`/products/${r.id}`) } });
      } else toast.error(r.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteProductAction(product.id);
      if (r.ok) {
        toast.success(r.message);
        router.push("/products");
      } else toast.error(r.error);
    });
  }

  const items: React.ReactNode[] = [];
  if (showEdit) {
    items.push(
      <DropdownMenuItem key="edit" asChild>
        <Link href={`/products/${product.id}`}>
          {caps.canEdit ? <Pencil /> : <Eye />} {caps.canEdit ? "Edit" : "View"}
        </Link>
      </DropdownMenuItem>,
    );
  }
  if (caps.canCreate) {
    items.push(
      <DropdownMenuItem key="dup" onSelect={duplicate}>
        <Copy /> Duplicate
      </DropdownMenuItem>,
    );
  }

  const statusItems: React.ReactNode[] = [];
  if (caps.canPublish && status !== "published" && status !== "archived") {
    statusItems.push(
      <DropdownMenuItem key="pub" onSelect={() => changeStatus("published")}>
        <CheckCircle2 /> Publish
      </DropdownMenuItem>,
    );
  }
  if (caps.canEdit && status === "draft") {
    statusItems.push(
      <DropdownMenuItem key="review" onSelect={() => changeStatus("in_review")}>
        <Send /> Submit for review
      </DropdownMenuItem>,
    );
  }
  if (caps.canPublish && status === "published") {
    statusItems.push(
      <DropdownMenuItem
        key="suspend"
        onSelect={() =>
          setConfirm({
            kind: "status",
            status: "suspended",
            title: `Suspend ${product.name}?`,
            body: "The product is taken off sale in the admin catalogue until it's published again.",
          })
        }
      >
        <Pause /> Suspend
      </DropdownMenuItem>,
    );
  }
  if (caps.canEdit && status !== "archived") {
    statusItems.push(
      <DropdownMenuItem
        key="archive"
        onSelect={() =>
          setConfirm({
            kind: "status",
            status: "archived",
            title: `Archive ${product.name}?`,
            body: "Archived products are kept with all their history but hidden from active work. You can restore them to draft later.",
          })
        }
      >
        <Archive /> Archive
      </DropdownMenuItem>,
    );
  }
  if (caps.canEdit && (status === "archived" || status === "suspended" || status === "in_review")) {
    statusItems.push(
      <DropdownMenuItem key="restore" onSelect={() => changeStatus("draft")}>
        <ArchiveRestore /> Move to draft
      </DropdownMenuItem>,
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger === "icon" ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${product.name}`} disabled={pending}>
              <MoreHorizontal />
            </Button>
          ) : (
            <Button variant="outline" disabled={pending}>
              <MoreHorizontal /> Actions
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {items}
          {items.length > 0 && statusItems.length > 0 && <DropdownMenuSeparator />}
          {statusItems}
          {caps.canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete" })}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "delete" ? `Delete ${product.name}?` : confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "The product and all of its images are permanently removed. Products with orders, licenses or packages can't be deleted — archive them instead."
                : confirm?.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "delete" ? "destructive" : "default"}
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c?.kind === "delete") remove();
                else if (c?.kind === "status") changeStatus(c.status);
              }}
            >
              {confirm?.kind === "delete" ? "Delete permanently" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
