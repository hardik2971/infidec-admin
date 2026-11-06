import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { listDownloadLogs } from "@/lib/downloads/service";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { getCustomer, listCustomerNotes, listLicenses, listOrders } from "@/lib/sales/service";
import { listTickets } from "@/lib/support/service";
import { CustomerDetail } from "./customer-detail";

export const metadata: Metadata = { title: "Customer" };

async function Customer({ params }: { params: PageProps<"/customers/[id]">["params"] }) {
  const session = await requirePermission("customers:view");
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(session.permissions, p);
  const [orders, licenses, notes, products, downloads, tickets] = await Promise.all([
    can("orders:view") ? listOrders({ customerId: id }) : Promise.resolve([]),
    can("licenses:view") ? listLicenses({ customerId: id }) : Promise.resolve([]),
    listCustomerNotes(id),
    listProducts(),
    can("downloads:view") ? listDownloadLogs({ customerId: id }, 200) : Promise.resolve([]),
    can("support:view") ? listTickets({ customerId: id }) : Promise.resolve([]),
  ]);

  return (
    <CustomerDetail
      customer={customer}
      orders={orders}
      licenses={licenses}
      notes={notes}
      downloads={downloads}
      tickets={tickets}
      products={products.map((p) => ({ id: p.id, name: p.name, currency: p.pricing.currency, archived: p.status === "archived" }))}
      caps={{ edit: can("customers:edit"), createOrder: can("orders:create"), editOrders: can("orders:edit"), editLicenses: can("licenses:edit") }}
    />
  );
}

export default function CustomerPage(props: PageProps<"/customers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
      <Customer params={props.params} />
    </Suspense>
  );
}
