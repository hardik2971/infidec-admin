import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/lib/auth/session";

/** Verifies the session before any admin chrome or page content renders. */
async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <SidebarProvider>
      <AppSidebar
        permissions={session.permissions}
        user={{
          displayName: session.displayName,
          email: session.email,
          photoURL: session.photoURL,
          roleName: session.roleName,
        }}
      />
      <SidebarInset className="min-w-0">
        <Topbar />
        <div className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-svh bg-sidebar">
      <div className="hidden w-64 shrink-0 flex-col gap-6 p-4 md:flex">
        <Skeleton className="h-7 w-32" />
        {Array.from({ length: 4 }).map((_, s) => (
          <div key={s} className="space-y-2.5">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ))}
      </div>
      <div className="m-2 flex-1 rounded-xl bg-background p-8 shadow-sm md:ml-0">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-80" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
