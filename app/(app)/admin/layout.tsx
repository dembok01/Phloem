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
      <NavTabs items={ADMIN_TABS} />
      {children}
      {/* ⌘K everywhere, not just for coordinators. */}
      <CommandPalette />
    </div>
  );
}
