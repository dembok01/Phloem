import { CommandPalette } from "@/components/command-palette";
import { NavTabs } from "@/components/nav-tabs";

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* The palette sits ON the tab row: the shortcut was invisible, and a
          jump-to-member control belongs beside the navigation it replaces. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavTabs
          items={[
            { href: "/coordinator", label: "Today", exact: true },
            { href: "/coordinator/pipeline", label: "Pipeline" },
          ]}
        />
        <CommandPalette />
      </div>
      {children}
    </div>
  );
}
