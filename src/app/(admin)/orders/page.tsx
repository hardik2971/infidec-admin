import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SalesView } from "@/components/sales/sales-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Orders" };

export default function Page() {
  return (
    <>
      <PageHeader title="Orders" description="Every purchase across marketplaces and the INFIDEC website. CodeCanyon payments and refunds are handled by Envato — they are only recorded here." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <SalesView />
      </Suspense>
    </>
  );
}
