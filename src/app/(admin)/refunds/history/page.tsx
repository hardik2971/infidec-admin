import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { RefundsView } from "@/components/refunds/refunds-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Refund History" };

export default function Page() {
  return (
    <>
      <PageHeader title="Refund History" description="Completed and rejected refunds, with their full decision history." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <RefundsView history={true} />
      </Suspense>
    </>
  );
}
