"use client";

// W1.6 — "compile it now". The summary is generated automatically at every cycle
// close; this is for the doctor who wants it before a consultation, or again after
// correcting a form.
//
// The label says what will happen, and the toast repeats the verb (DESIGN-SYSTEM §5):
// Compile → Compiled. On success it navigates straight to the document, because the
// reason you pressed it is that you want to read it.
import * as React from "react";
import { useRouter } from "next/navigation";
import { FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { compileProgressSummary } from "@/app/(app)/clinician/clients/[id]/actions";

export function CompileProgressButton({
  memberId,
  cycleId,
  exists,
}: {
  memberId: string;
  cycleId: string | null;
  /** a summary already exists for this cycle — pressing again writes a new version */
  exists: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await compileProgressSummary({
            member_id: memberId,
            cycle_id: cycleId,
            force: exists,
          });
          if (res.ok) {
            toast("success", exists ? "Compiled a fresh version" : "Progress summary compiled");
            router.push(`/reports/${res.data}`);
          } else {
            toast("error", res.error);
          }
        })
      }
    >
      <FileStack className="size-3.5" aria-hidden />
      {exists ? "Recompile progress summary" : "Compile progress summary"}
    </Button>
  );
}
