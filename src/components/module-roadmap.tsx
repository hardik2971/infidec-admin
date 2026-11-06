import { CheckCircle2, Circle, Hammer } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CURRENT_PHASE, findNavItem, type NavItem } from "@/config/navigation";
import { requirePermission } from "@/lib/auth/session";

const PHASES: Record<number, string> = {
  1: "Foundation, authentication, dashboard & RBAC",
  2: "Multi-product management, import & product wizard",
  3: "Storage, source ZIP packages & versions",
  4: "Documentation CMS, customers, orders & licenses",
  5: "Secure downloads, Envato API, marketplace listings, support & refunds",
  6: "Website sync, email, analytics, reports & logs",
  7: "Security & performance testing, production deployment",
};

async function Roadmap({ item }: { item: NavItem }) {
  await requirePermission(item.permission);
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-8 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
        <div className="space-y-4">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
            <Hammer className="size-5" />
          </span>
          <h2 className="text-lg font-semibold">This module is on the build plan</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">{item.title}</strong> is delivered in Phase {item.phase}. The
            navigation, permissions and Firestore collections it relies on are already in place, so it plugs in without
            changes to the rest of the platform.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
        <ol className="space-y-3">
          {Object.entries(PHASES).map(([n, label]) => {
            const phase = Number(n);
            const done = phase <= CURRENT_PHASE;
            const target = phase === item.phase;
            return (
              <li
                key={n}
                className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${
                  target ? "border-primary/40 bg-accent" : "border-transparent"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <Circle className={`mt-0.5 size-4 shrink-0 ${target ? "text-primary" : "text-muted-foreground/50"}`} />
                )}
                <span className={done || target ? "" : "text-muted-foreground"}>
                  <span className="font-medium">{`Phase ${phase}`}</span> — {label}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder for a navigation entry whose module ships in a later phase.
 * Each scheduled route has its own page file rendering this, so unknown URLs 404.
 */
export function ModuleRoadmap({ href }: { href: string }) {
  const item = findNavItem(href);
  if (!item) throw new Error(`No navigation entry for ${href}`);
  return (
    <>
      <PageHeader
        title={item.title}
        description={item.description}
        actions={<Badge variant="secondary">{`Scheduled · Phase ${item.phase}`}</Badge>}
      />
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
        <Roadmap item={item} />
      </Suspense>
    </>
  );
}
