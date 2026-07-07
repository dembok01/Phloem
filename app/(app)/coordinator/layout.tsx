import { NavTabs } from "@/components/nav-tabs";

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <NavTabs
        items={[
          { href: "/coordinator", label: "Today", exact: true },
          { href: "/coordinator/pipeline", label: "Pipeline" },
        ]}
      />
      {children}
    </div>
  );
}
