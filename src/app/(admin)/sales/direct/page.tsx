import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SalesView } from "@/components/sales/sales-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Direct Sales" };

export default function Page() {
  return (
    <>
      <PageHeader title="Direct Sales" description="Sales made on the INFIDEC website, with INFIDEC-issued licenses." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <SalesView channel="direct" />
      </Suspense>
    </>
  );
}
