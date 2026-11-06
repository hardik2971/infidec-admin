import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { RefundsView } from "@/components/refunds/refunds-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Refund Requests" };

export default function Page() {
  return (
    <>
      <PageHeader title="Refund Requests" description="Open refund requests. Marketplace refunds are processed by the marketplace and direct refunds by your payment gateway — this tracks them from request to completion." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <RefundsView history={false} />
      </Suspense>
    </>
  );
}
