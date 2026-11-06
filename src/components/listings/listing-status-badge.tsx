import { Badge } from "@/components/ui/badge";
import { LISTING_STATUS_LABELS, type ListingStatus } from "@/lib/listings/schema";
import { cn } from "@/lib/utils";

const STYLE: Record<ListingStatus, string> = {
  draft: "text-muted-foreground",
  ready: "border-primary/40 text-primary",
  submitted: "border-chart-2/40 text-chart-2",
  under_review: "border-warning/40 text-warning",
  approved: "border-success/40 text-success",
  rejected: "border-destructive/40 text-destructive",
  published: "border-success/40 bg-success/8 text-success",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1.5", STYLE[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {LISTING_STATUS_LABELS[status]}
    </Badge>
  );
}
