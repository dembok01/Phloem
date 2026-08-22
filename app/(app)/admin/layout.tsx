import { NavTabs, type NavItem } from "@/components/nav-tabs";
import { CommandPalette } from "@/components/command-palette";

const ADMIN_TABS: NavItem[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/care-team", label: "Care team" },
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* ⌘K everywhere, and now visibly so. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavTabs items={ADMIN_TABS} />
        <CommandPalette />
      </div>
      {children}
    </div>
  );
}
