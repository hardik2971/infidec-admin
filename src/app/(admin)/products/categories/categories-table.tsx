"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryRecord } from "@/lib/products/categories";
import { SLUG_RE, slugify } from "@/lib/products/schema";
import { deleteCategoryAction, saveCategoryAction } from "./actions";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(60),
  slug: z.string().trim().min(2, "Enter a slug.").max(64).regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens."),
  description: z.string().trim().max(300),
});
type Values = z.infer<typeof schema>;

function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRecord | null;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { name: category?.name ?? "", slug: category?.slug ?? "", description: category?.description ?? "" },
  });
  const [slugTouched, setSlugTouched] = useState(!!category);
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Values) {
    const result = await saveCategoryAction({ id: category?.id, values });
    if (result.ok) {
      toast.success(result.message);
      onOpenChange(false);
    } else toast.error(result.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>Categories organise the catalogue across every product.</DialogDescription>
        </DialogHeader>
        <form id="category-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="cat-name">Name</FieldLabel>
              <Input
                id="cat-name"
                {...form.register("name", {
                  onChange: (e) => !slugTouched && form.setValue("slug", slugify(e.target.value)),
                })}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="cat-slug">Slug</FieldLabel>
              <Input id="cat-slug" className="font-mono text-sm" {...form.register("slug", { onChange: () => setSlugTouched(true) })} />
              <FieldDescription>Used in URLs and integrations.</FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="cat-desc">Description</FieldLabel>
              <Textarea id="cat-desc" rows={3} {...form.register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {category ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesTable({
  categories,
  canCreate,
  canEdit,
  canDelete,
}: {
  categories: CategoryRecord[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null);
  const [pending, startTransition] = useTransition();

  const columns = useMemo<DataTableColumn<CategoryRecord>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Category",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.description && <p className="line-clamp-1 text-xs text-muted-foreground">{row.original.description}</p>}
          </div>
        ),
      },
      { accessorKey: "slug", header: "Slug", cell: ({ row }) => <code className="text-xs text-muted-foreground">{row.original.slug}</code> },
      {
        accessorKey: "productCount",
        header: "Products",
        cell: ({ row }) => <Badge variant="secondary" className="tabular">{row.original.productCount}</Badge>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) =>
          canEdit || canDelete ? (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`} disabled={pending}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(row.original);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null,
      },
    ],
    [canEdit, canDelete, pending],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={categories}
        searchText={(c) => `${c.name} ${c.slug} ${c.description}`}
        searchPlaceholder="Search categories…"
        emptyTitle="No categories yet"
        emptyDescription="Create categories here, or import the website catalogue to bring in its categories."
        toolbar={
          canCreate ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <FolderPlus /> New category
            </Button>
          ) : null
        }
      />
      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={editing} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.productCount
                ? `${deleting.productCount} product(s) still use this category, so it can't be deleted yet.`
                : "This category isn't used by any product. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!!deleting?.productCount}
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (target)
                  startTransition(async () => {
                    const r = await deleteCategoryAction(target.id);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
