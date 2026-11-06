"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { CURRENT_PHASE, NAVIGATION, type NavItem } from "@/config/navigation";
import { hasPermission } from "@/lib/rbac/permissions";
import { UserMenu, type UserSummary } from "./user-menu";

function isActive(pathname: string, item: NavItem, siblings: NavItem[]) {
  if (pathname === item.href) return true;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  // Prefer the most specific sibling match (e.g. /products/new over /products).
  return !siblings.some((s) => s !== item && s.href.startsWith(item.href) && pathname.startsWith(s.href));
}

export function AppSidebar({ permissions, user }: { permissions: string[]; user: UserSummary }) {
  const pathname = usePathname();
  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasPermission(permissions, item.permission)),
  })).filter((section) => section.items.length > 0);
  const allItems = sections.flatMap((s) => s.items);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Link href="/dashboard" className="flex h-8 items-center gap-2" aria-label="INFIDEC Admin home">
          <Logo className="h-6 group-data-[collapsible=icon]:hidden" priority />
          <LogoMark className="hidden size-7 group-data-[collapsible=icon]:block" />
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 pb-4">
        {sections.map((section) => (
          <SidebarGroup key={section.title} className="py-1.5">
            <SidebarGroupLabel className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase">
              {section.title}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item, allItems);
                const upcoming = item.phase > CURRENT_PHASE;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={
                        active
                          ? "relative font-medium before:absolute before:top-1.5 before:bottom-1.5 before:-left-2 before:w-[3px] before:rounded-full before:bg-brand-gradient"
                          : upcoming
                            ? "text-sidebar-foreground/65"
                            : undefined
                      }
                    >
                      <Link href={item.href}>
                        <item.icon className={active ? "text-primary" : undefined} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {upcoming && (
                      <SidebarMenuBadge className="rounded-md border border-sidebar-border px-1.5 text-[10px] font-medium text-muted-foreground">
                        P{item.phase}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70">
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
