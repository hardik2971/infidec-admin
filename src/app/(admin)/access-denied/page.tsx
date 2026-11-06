import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldX />
        </EmptyMedia>
        <EmptyTitle>You don&apos;t have access to this page</EmptyTitle>
        <EmptyDescription>
          Your role doesn&apos;t include the permission this module needs. Ask a Super Admin to update your role if you
          need access.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
