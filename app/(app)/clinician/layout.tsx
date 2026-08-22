import { CommandPalette } from "@/components/command-palette";

// The clinician desk had no shell of its own, which is why the ⌘K palette — the
// fastest way to reach a client — stopped at the coordinator and admin doors.
// The search is RLS-scoped like every other read, so a doctor's results are the
// doctor's caseload; mounting it here grants nothing new.
export default function ClinicianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CommandPalette desk="clinician" />
      </div>
      {children}
    </div>
  );
}
