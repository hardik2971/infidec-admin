import { Timestamp } from "firebase-admin/firestore";
import { ChevronRight, FileDown, LogIn, LogOut, ShieldAlert, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { formatDateTime } from "@/lib/format";
import { hasPermission } from "@/lib/rbac/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity Logs" };

const PAGE_SIZE = 50;

/** Filters by audit domain (the part of the action before the dot). */
const CATEGORIES = {
  all: { label: "All activity", domains: null },
  auth: { label: "Sign-ins", domains: ["auth"] },
  staff: { label: "Staff & permissions", domains: ["staff", "role"] },
  products: { label: "Products", domains: ["product", "category", "listing"] },
  packages: { label: "Packages & versions", domains: ["package", "version", "storage"] },
  docs: { label: "Documentation", domains: ["doc"] },
  sales: { label: "Customers & orders", domains: ["customer", "order"] },
  licenses: { label: "Licenses & downloads", domains: ["license", "download", "envato"] },
  support: { label: "Support & refunds", domains: ["ticket", "refund"] },
  system: { label: "Settings & integrations", domains: ["settings", "integration", "system", "report"] },
} as const;
type Category = keyof typeof CATEGORIES;

const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  "auth.login": { icon: LogIn, className: "bg-success/12 text-success" },
  "auth.logout": { icon: LogOut, className: "bg-muted text-muted-foreground" },
  "auth.login_failed": { icon: ShieldAlert, className: "bg-destructive/10 text-destructive" },
  "role.permissions_changed": { icon: ShieldCheck, className: "bg-chart-3/12 text-chart-3" },
};
const DEFAULT_ICON = { icon: UserCog, className: "bg-primary/10 text-primary" };

async function ActivityList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("activity:view");
  const canExport = hasPermission(session.permissions, "activity:export");
  const sp = await searchParams;
  const category: Category = typeof sp.type === "string" && sp.type in CATEGORIES ? (sp.type as Category) : "all";
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;

  let query = adminDb.collection(COLLECTIONS.activityLogs).orderBy("createdAt", "desc");
  const domains = CATEGORIES[category].domains;
  if (domains) query = query.where("domain", "in", [...domains]);
  if (before) query = query.startAfter(Timestamp.fromDate(before));

  let docs;
  try {
    docs = (await query.limit(PAGE_SIZE + 1).get()).docs;
  } catch (error) {
    console.error("[activity] query failed", error);
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Activity couldn&apos;t be loaded</EmptyTitle>
          <EmptyDescription>
            Filtered views need the Firestore indexes from <code>firebase/firestore.indexes.json</code>. Deploy them with{" "}
            <code>firebase deploy --only firestore:indexes</code>.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const hasMore = docs.length > PAGE_SIZE;
  const entries = docs.slice(0, PAGE_SIZE).map((d) => {
    const data = d.data();
    return {
      id: d.id,
      action: String(data.action ?? ""),
      summary: String(data.summary ?? ""),
      actorEmail: (data.actorEmail as string | null) ?? null,
      ip: (data.ip as string | null) ?? null,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
    };
  });
  const last = entries.at(-1)?.createdAt;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(CATEGORIES) as Category[]).map((key) => (
          <Button key={key} asChild size="sm" variant={key === category ? "secondary" : "ghost"}>
            <Link href={key === "all" ? "/system/activity" : `/system/activity?type=${key}`}>{CATEGORIES[key].label}</Link>
          </Button>
        ))}
        {canExport && (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <a href="/api/activity/export" download title="Last 30 days as CSV">
              <FileDown /> Export CSV (30 days)
            </a>
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserCog />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>Sign-ins, staff and permission changes will appear here as they happen.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="gap-0 divide-y p-0">
          {entries.map((e) => {
            const { icon: Icon, className } = ICONS[e.action] ?? DEFAULT_ICON;
            return (
              <div key={e.id} className="flex items-start gap-3.5 px-5 py-3.5">
                <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg", className)}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{e.actorEmail ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">— {e.summary}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-mono text-[10.5px] font-normal">
                      {e.action}
                    </Badge>
                    {e.ip && <span className="font-mono">{e.ip}</span>}
                  </div>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground tabular" dateTime={e.createdAt?.toISOString()}>
                  {formatDateTime(e.createdAt)}
                </time>
              </div>
            );
          })}
        </Card>
      )}

      {hasMore && last && (
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/system/activity?${new URLSearchParams({
                ...(category !== "all" ? { type: category } : {}),
                before: last.toISOString(),
              })}`}
            >
              Older entries <ChevronRight />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage(props: PageProps<"/system/activity">) {
  return (
    <>
      <PageHeader
        title="Activity Logs"
        description="An append-only audit trail. Entries are written by the server and cannot be edited or deleted from the admin."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full rounded-xl" />}>
        <ActivityList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
