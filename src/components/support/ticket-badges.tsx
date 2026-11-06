import { Badge } from "@/components/ui/badge";
import { TICKET_STATUS_LABELS, type Priority, type TicketStatus } from "@/lib/support/schema";
import { cn } from "@/lib/utils";

const STATUS: Record<TicketStatus, string> = {
  open: "border-primary/40 text-primary",
  in_progress: "border-chart-2/40 text-chart-2",
  waiting_customer: "border-warning/40 text-warning",
  resolved: "border-success/40 text-success",
  closed: "text-muted-foreground",
};
const PRIORITY: Record<Priority, string> = {
  low: "text-muted-foreground",
  normal: "",
  high: "border-warning/40 text-warning",
  urgent: "border-destructive/40 bg-destructive/5 text-destructive",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", STATUS[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("capitalize", PRIORITY[priority])}>
      {priority}
    </Badge>
  );
}
