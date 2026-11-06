"use client";

import { History, Package } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

const ALL = "__all__";

export function PackagesFilters({
  products,
  productId,
  includeHistory,
}: {
  products: { id: string; name: string }[];
  productId?: string;
  includeHistory: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(next: { productId?: string; includeHistory?: boolean }) {
    const params = new URLSearchParams();
    const pid = "productId" in next ? next.productId : productId;
    const hist = next.includeHistory ?? includeHistory;
    if (pid) params.set("product", pid);
    if (hist) params.set("history", "1");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {pending && <Spinner className="text-muted-foreground" />}
      <Select value={productId ?? ALL} onValueChange={(v) => apply({ productId: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-48 bg-card" aria-label="Filter by product">
          <Package className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={ALL}>All products</SelectItem>
          {products.length > 0 && <SelectSeparator />}
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
        <Switch checked={includeHistory} onCheckedChange={(v) => apply({ includeHistory: v })} />
        <History className="size-3.5" /> Show history
      </Label>
    </div>
  );
}
