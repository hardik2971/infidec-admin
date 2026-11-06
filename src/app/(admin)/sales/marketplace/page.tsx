import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SalesView } from "@/components/sales/sales-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Marketplace Sales" };

export default function Page() {
  return (
    <>
      <PageHeader title="Marketplace Sales" description="Sales made through CodeCanyon and other marketplaces. Verified sales come from the official Envato API." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <SalesView channel="marketplace" />
      </Suspense>
    </>
  );
}
