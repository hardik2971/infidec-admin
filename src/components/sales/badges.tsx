import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS, supportActive, type LicenseRecord, type OrderStatus, type VerificationStatus } from "@/lib/sales/schema";
import { cn } from "@/lib/utils";

const ORDER_STYLES: Record<OrderStatus, string> = {
  pending: "border-warning/40 text-warning",
  completed: "border-success/40 bg-success/8 text-success",
  failed: "border-destructive/40 text-destructive",
  cancelled: "text-muted-foreground",
  refunded: "border-chart-3/40 text-chart-3",
  partially_refunded: "border-chart-3/40 text-chart-3",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", ORDER_STYLES[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") return <Badge variant="outline" className="border-success/40 text-success">Verified</Badge>;
  if (status === "failed") return <Badge variant="outline" className="border-destructive/40 text-destructive">Failed</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>;
}

export function LicenseStatusBadge({ license }: { license: Pick<LicenseRecord, "status" | "supportExpiry"> }) {
  if (license.status === "refunded") return <Badge variant="outline" className="border-chart-3/40 text-chart-3">Refunded</Badge>;
  if (license.status === "revoked") return <Badge variant="outline" className="border-destructive/40 text-destructive">Revoked</Badge>;
  return supportActive(license) ? (
    <Badge variant="outline" className="border-success/40 bg-success/8 text-success">Active · supported</Badge>
  ) : (
    <Badge variant="outline" className="border-warning/40 text-warning">Active · support expired</Badge>
  );
}
