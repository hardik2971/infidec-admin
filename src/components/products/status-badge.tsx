import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ProductStatus } from "@/lib/products/schema";
import { cn } from "@/lib/utils";

const STYLES: Record<ProductStatus, string> = {
  draft: "border-border text-muted-foreground",
  in_review: "border-chart-2/40 text-chart-2",
  published: "border-success/40 bg-success/8 text-success",
  suspended: "border-warning/40 text-warning",
  archived: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", STYLES[status], className)}>
      <span className={cn("size-1.5 rounded-full bg-current", status === "draft" && "opacity-60")} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
