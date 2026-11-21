"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, ArrowUpRight, Bell, CalendarDays, ChevronRight,
  HeartHandshake, KanbanSquare, LayoutDashboard,
  Loader2, Mail, Settings2, ShieldCheck, Users, UsersRound,
  type LucideIcon,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { ROLE_LABEL, type UserRole } from "@/lib/roles";
import { roleHome } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Destination = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const ADMIN: Destination[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/care-team", label: "Care team", icon: HeartHandshake },
  { href: "/admin/invites", label: "Invitations", icon: Mail },
  { href: "/admin/audit", label: "Activity log", icon: Activity },
];
const COORDINATOR: Destination[] = [
  { href: "/coordinator", label: "Today", icon: CalendarDays, exact: true },
  { href: "/coordinator/pipeline", label: "Care pipeline", icon: KanbanSquare },
  { href: "/coordinator/safety-card", label: "Safety reference", icon: ShieldCheck },
];
const CLINICIAN: Destination[] = [
  { href: "/clinician/clients", label: "My members", icon: UsersRound },
  { href: "/clinician/safety-card", label: "Safety reference", icon: ShieldCheck },
];
const PERSONAL: Destination[] = [
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/account", label: "Your account", icon: Settings2 },
];

/** Navigation is a presentation of the existing role routes. Server layouts,
 * middleware and database policies continue to own access. Server components
 * are passed as slots, keeping session and care-team reads on the server. */
export function WorkspaceShell({
  role, viewRole, switcher, notifications, account, lensBanner, children,
}: {
  role: UserRole;
  viewRole: UserRole;
  switcher: ReactNode;
  notifications: ReactNode;
  account: ReactNode;
  lensBanner: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const family = role === "caregiver" || role === "member";
  const coordinator = pathname.startsWith("/coordinator") || role === "coordinator";
  const clinical = pathname.startsWith("/clinician") || !["admin", "coordinator", "caregiver", "member"].includes(role);
  const items = coordinator ? COORDINATOR : clinical ? CLINICIAN : ADMIN;
  const desk = coordinator ? "coordinator" : clinical ? "clinician" : "admin";
  const context = family ? "Your family's care" : coordinator ? "Care coordination" : clinical ? (viewRole === "admin" ? "Care team workspace" : `${ROLE_LABEL[viewRole]} workspace`) : "Practice overview";
  const current = [...items, ...PERSONAL].find((item) => isCurrent(pathname, item));

  return (
    <div className={cn("workspace-shell flex min-h-screen flex-col", !family && "lg:pl-64")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[70] focus:rounded-xl focus:bg-card focus:px-4 focus:py-3 focus:shadow-pop">
        Skip to content
      </a>

      {!family ? (
        <aside className="workspace-sidebar fixed inset-y-4 left-4 z-20 hidden w-56 flex-col overflow-x-hidden overflow-y-auto rounded-3xl p-4 [scrollbar-width:thin] lg:flex print:hidden">
          <Link href={roleHome(role)} className="mx-1 mt-2 block w-fit rounded-xl bg-white px-3 py-2.5" aria-label="PHLOEM home">
            <Image src="/phloem-logo.png" alt="PHLOEM" width={120} height={40} className="h-8 w-auto" priority />
          </Link>
          <p className="mt-9 mb-3 px-3 font-data text-[10px] font-medium tracking-[0.16em] text-white/55 uppercase">Workspace</p>
          <nav aria-label="Main navigation" className="space-y-1.5">
            {items.map((item) => <WorkspaceLink key={item.href} item={item} active={isCurrent(pathname, item)} />)}
          </nav>
          <div className="mt-auto pt-8">
            <div className="mb-5 border-t border-white/10 pt-5">
              <nav aria-label="Personal navigation" className="space-y-1.5">
                {PERSONAL.map((item) => <WorkspaceLink key={item.href} item={item} active={isCurrent(pathname, item)} />)}
              </nav>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5">
              <RingMark className="mb-3 size-8 text-[#b6d8bc]" />
              <p className="font-display text-base font-medium text-white">Care, connected.</p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">One team. Every step.</p>
            </div>
          </div>
        </aside>
      ) : null}

      <header className="workspace-topbar sticky top-0 z-30 print:hidden">
        <div className={cn("mx-auto flex min-h-20 items-center justify-between gap-3 px-4 sm:px-7 lg:px-9", family ? "max-w-6xl" : "max-w-[1440px]")}>
          {family ? (
            <Link href="/portal" className="shrink-0 rounded-lg" aria-label="PHLOEM home">
              <Image src="/phloem-logo.png" alt="PHLOEM" width={120} height={40} className="h-7 w-auto sm:h-9" priority />
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <Link href={roleHome(role)} className="shrink-0 rounded-lg text-primary lg:hidden" aria-label="PHLOEM home"><RingMark className="size-8" /></Link>
              <div className="hidden min-w-0 sm:block">
                <p className="text-xs text-muted-foreground">{context}</p>
                <p className="mt-0.5 truncate text-sm font-bold text-foreground">{current?.label ?? "Member care"}</p>
              </div>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            {!family ? <CommandPalette key={desk} desk={desk} /> : null}
            {switcher}
            <div className="flex items-center gap-1 border-l border-border/80 pl-1.5 sm:gap-2 sm:pl-3">
              {notifications}
              {account}
            </div>
          </div>
        </div>
        {lensBanner}
        {!family ? (
          <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 lg:hidden">
            <nav aria-label="Main navigation" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
              {items.map((item) => {
                const active = isCurrent(pathname, item);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("workspace-mobile-link flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                    <Icon className="size-4" aria-hidden /><span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}
      </header>

      <main id="main" className={cn("mx-auto w-full flex-1 px-4 pt-7 pb-12 sm:px-7 sm:pt-9 lg:px-9", family ? "max-w-6xl" : "max-w-[1440px]")}>
        {children}
      </main>
      <footer className={cn("mx-auto flex items-center justify-between gap-3 px-4 pb-6 text-xs text-muted-foreground sm:px-7 lg:px-9 print:hidden", family ? "max-w-6xl" : "max-w-[1440px]")}>
        <span className="inline-flex items-center gap-2"><HeartHandshake className="size-3.5" aria-hidden /> PHLOEM · Connected care</span>
        <Link href="/account" className="inline-flex items-center gap-1.5 rounded-md hover:text-primary"><Settings2 className="size-3.5" aria-hidden /> Your account <ArrowUpRight className="size-3" aria-hidden /></Link>
      </footer>
    </div>
  );
}

function isCurrent(pathname: string, item: Destination) {
  return pathname === item.href || (!item.exact && pathname.startsWith(item.href + "/"));
}

function WorkspaceLink({ item, active }: { item: Destination; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("workspace-nav-link group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm", active && "is-active")}>
      <Icon className="size-[18px] shrink-0" strokeWidth={1.7} aria-hidden />
      <span className="flex-1">{item.label}</span>
      <NavigationState active={active} />
    </Link>
  );
}

function NavigationState({ active }: { active: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-3.5 animate-spin" aria-label="Loading" /> : active ? <ChevronRight className="size-3.5 opacity-70" aria-hidden /> : null;
}

export function RingMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="1.2" opacity=".35" />
      <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" opacity=".65" />
      <circle cx="20" cy="20" r="7" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="20" cy="20" r="2" fill="currentColor" />
    </svg>
  );
}
