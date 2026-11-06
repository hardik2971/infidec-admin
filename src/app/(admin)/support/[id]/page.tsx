import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getProduct } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { getCustomer } from "@/lib/sales/service";
import { getCategories, getTicket, listMessages } from "@/lib/support/service";
import { TicketView } from "./ticket-view";

export const metadata: Metadata = { title: "Ticket" };

async function Ticket({ params }: { params: PageProps<"/support/[id]">["params"] }) {
  const session = await requirePermission("support:view");
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const [messages, customer, product, categories, staffSnap] = await Promise.all([
    listMessages(id),
    getCustomer(ticket.customerId),
    getProduct(ticket.productId),
    getCategories(),
    adminDb.collection(COLLECTIONS.staff).where("status", "==", "active").get(),
  ]);
  const staff = staffSnap.docs
    .map((d) => ({ id: d.id, name: String(d.get("displayName") ?? d.get("email")) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <TicketView
      ticket={ticket}
      messages={messages}
      customer={customer ? { id: customer.id, name: customer.name, email: customer.email } : null}
      productName={product?.name ?? "Unknown product"}
      categories={categories.includes(ticket.category) ? categories : [ticket.category, ...categories]}
      staff={staff}
      canEdit={hasPermission(session.permissions, "support:edit")}
    />
  );
}

export default function TicketPage(props: PageProps<"/support/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
      <Ticket params={props.params} />
    </Suspense>
  );
}
