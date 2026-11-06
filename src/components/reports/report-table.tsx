import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatMoney, formatNumber } from "@/lib/format";
import type { Report, ReportColumn, ReportRow } from "@/lib/reports/schema";
import { cn } from "@/lib/utils";

function cell(c: ReportColumn, r: ReportRow) {
  const v = r[c.key];
  if (v == null || v === "") return "—";
  switch (c.kind) {
    case "money":
      return formatMoney(Number(v), String(r.currency ?? "INR"));
    case "bytes":
      return formatBytes(Number(v));
    case "number":
      return formatNumber(Number(v));
    default:
      return String(v);
  }
}

/** Server-renderable report table, used by the preview and the print view. */
export function ReportTable({ report, limit, dense }: { report: Report; limit?: number; dense?: boolean }) {
  const rows = limit ? report.rows.slice(0, limit) : report.rows;
  const right = (c: ReportColumn) => c.kind === "money" || c.kind === "number" || c.kind === "bytes";
  return (
    <Table className={cn(dense && "text-xs")}>
      <TableHeader>
        <TableRow>
          {report.columns.map((c) => (
            <TableHead key={c.key} className={cn(right(c) && "text-right", dense && "h-8 px-1.5")}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i} className="break-inside-avoid">
            {report.columns.map((c) => (
              <TableCell key={c.key} className={cn("max-w-64 truncate", right(c) && "text-right tabular", dense && "max-w-none px-1.5 py-1 whitespace-normal")}>
                {cell(c, r)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
