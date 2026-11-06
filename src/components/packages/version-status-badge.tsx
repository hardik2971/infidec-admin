import { Badge } from "@/components/ui/badge";
import { VERSION_STATUS_LABELS, type VersionStatus } from "@/lib/packages/schema";
import { cn } from "@/lib/utils";

const STYLES: Record<VersionStatus, string> = {
  draft: "border-primary/30 text-primary",
  published: "border-success/40 bg-success/8 text-success",
  deprecated: "border-border bg-muted text-muted-foreground",
};

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", STYLES[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {VERSION_STATUS_LABELS[status]}
    </Badge>
  );
}
