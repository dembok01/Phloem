"use client";

// W2 — starting a conversation. Two audiences, one component, different words:
//
//   family  → "Ask your care team": a question box and a choice of who should see
//             it, phrased as people ("The doctor"), never as roles in the system's
//             own vocabulary.
//   team    → "Start an internal note": the same shape, but the copy is explicit
//             that the family cannot see it, because getting that wrong is the
//             expensive mistake.
//
// One step, not two: subject and first message post together, so asking a question
// never leaves an empty thread behind.
import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { startThread } from "@/app/(app)/thread-actions";

type Who = "anyone" | "doctor" | "nutritionist" | "trainer";

const WHO_LABEL: Record<Who, string> = {
  anyone: "Anyone on the team",
  doctor: "The doctor",
  nutritionist: "The nutritionist",
  trainer: "The trainer",
};

export function NewThread({
  memberId,
  kind,
  memberFirstName,
}: {
  memberId: string;
  kind: "family" | "care_team";
  memberFirstName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [who, setWho] = React.useState<Who>("anyone");
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const isFamily = kind === "family";

  function submit() {
    if (pending || subject.trim() === "" || body.trim() === "") return;
    startTransition(async () => {
      const res = await startThread({
        member_id: memberId,
        kind,
        subject: subject.trim(),
        body: body.trim(),
        audience: isFamily && who !== "anyone" ? [who] : undefined,
      });
      if (res.ok) {
        setSubject("");
        setBody("");
        setWho("anyone");
        setOpen(false);
        toast("success", isFamily ? "Question sent to the care team" : "Note started");
        router.refresh();
      } else {
        toast("error", res.error);
      }
    });
  }

  if (!open) {
    return (
      <Button variant={isFamily ? "default" : "outline"} onClick={() => setOpen(true)}>
        <MessageSquarePlus className="size-4" aria-hidden />
        {isFamily ? "Ask your care team" : "Start an internal note"}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
      <div>
        <h3 className="font-display text-lg font-semibold">
          {isFamily ? "Ask your care team" : "Start an internal note"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isFamily
            ? `Anything about ${memberFirstName ?? "your parent"}'s care — the team replies here, and you'll get a notification.`
            : "Visible to the care team and the coordinator. The family cannot see this."}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="thread-subject" className="text-sm font-medium">
          What is it about?
        </label>
        <input
          id="thread-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder={isFamily ? "e.g. Trouble with the new diet" : "e.g. Adherence dropping this cycle"}
          className="w-full rounded-lg border bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      {isFamily ? (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Who should see it?</legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(WHO_LABEL) as Who[]).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={who === w}
                onClick={() => setWho(w)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  who === w
                    ? "border-transparent bg-secondary text-secondary-foreground"
                    : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {WHO_LABEL[w]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="thread-body" className="text-sm font-medium">
          Your message
        </label>
        <textarea
          id="thread-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={
            isFamily
              ? "Tell them what's happening, and what you'd like help with."
              : "What the team needs to know."
          }
          className="w-full rounded-lg border bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      <div className="flex gap-2">
        <Button
          loading={pending}
          disabled={pending || subject.trim() === "" || body.trim() === ""}
          onClick={submit}
        >
          {isFamily ? "Send question" : "Start note"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
