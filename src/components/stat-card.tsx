import { AlertTriangle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  error,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  /** When set, the value is unavailable and the reason is shown instead. */
  error?: string;
  tone?: "default" | "primary" | "violet" | "cyan" | "success" | "warning";
  className?: string;
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    violet: "bg-chart-3/12 text-chart-3",
    cyan: "bg-chart-2/15 text-chart-2",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
  }[tone];

  return (
    <Card className={cn("gap-0 p-4 transition-shadow hover:shadow-md", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" />
        </span>
      </div>
      {error ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground">
              <AlertTriangle className="size-3.5 text-warning" /> Unavailable
            </p>
          </TooltipTrigger>
          <TooltipContent>{error}</TooltipContent>
        </Tooltip>
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</p>
      )}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
