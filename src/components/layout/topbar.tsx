"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NAVIGATION } from "@/config/navigation";

function crumbsFor(pathname: string) {
  for (const section of NAVIGATION) {
    const match = [...section.items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (match) return { section: section.title, item: match };
  }
  return null;
}

export function Topbar() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="-ml-1.5" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs ? (
            <>
              <BreadcrumbItem className="hidden md:block">{crumbs.section}</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {pathname === crumbs.item.href ? (
                  <BreadcrumbPage>{crumbs.item.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumbs.item.href}>{crumbs.item.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>INFIDEC Admin</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
