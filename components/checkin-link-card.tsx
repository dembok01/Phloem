"use client";

// W3.2 — the coordinator's side of the family check-in link.
//
// The whole point is re-engaging a family that has stopped logging in, so the
// primary action is "send it on WhatsApp" (the channel these families actually
// use), with copy as the fallback. The link is shown in full rather than hidden
// behind a button: a coordinator on the phone to a family often reads it aloud.
import * as React from "react";
import { Check, Copy, Link2, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { waMeLink } from "@/lib/wa";
import { createCheckinLink, revokeCheckinLink } from "@/app/(app)/program-actions";

export function CheckinLinkCard({
  memberId,
  memberFirstName,
  existingToken,
  whatsapp,
  expiresAt,
}: {
  memberId: string;
  memberFirstName: string;
  existingToken: string | null;
  /** the family's WhatsApp number, when the viewer's role may see it */
  whatsapp?: string | null;
  expiresAt?: string | null;
}) {
  const [token, setToken] = React.useState(existingToken);
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const { toast } = useToast();

  const url = token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/c/${token}`
    : null;

  const waHref = (() => {
    if (!url) return null;
    const base = waMeLink(whatsapp);
    const text = encodeURIComponent(
      `Hello — a quick check-in on how ${memberFirstName} is doing this week. It takes a minute, no login needed: ${url}`,
    );
    // With a number we open that chat; without one, WhatsApp's share sheet.
    return base ? `${base}?text=${text}` : `https://wa.me/?text=${text}`;
  })();

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
      <div>
        <h3 className="flex items-center gap-2 font-medium">
          <Link2 className="size-4 text-muted-foreground" aria-hidden /> Check-in link
        </h3>
        <p className="text-sm text-muted-foreground">
          Five questions, no login. Use it when a family has gone quiet — the answers land in your
          queue and clear their quiet flag.
        </p>
      </div>

      {token && url ? (
        <>
          <p className="rounded-lg bg-muted/50 px-3 py-2 font-data text-xs break-all">{url}</p>
          {expiresAt ? (
            <p className="text-xs text-muted-foreground">Works until {expiresAt}.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                <MessageCircle className="size-4" aria-hidden /> Send on WhatsApp
              </a>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  toast("error", "Couldn't copy — select the link above instead.");
                }
              }}
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={pending}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await revokeCheckinLink({ token, member_id: memberId });
                  if (res.ok) {
                    setToken(null);
                    toast("success", "Link revoked");
                  } else {
                    toast("error", res.error);
                  }
                })
              }
            >
              <Trash2 className="size-4" aria-hidden /> Revoke
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await createCheckinLink({ member_id: memberId });
              if (res.ok) {
                setToken(res.data);
                toast("success", "Check-in link ready");
              } else {
                toast("error", res.error);
              }
            })
          }
        >
          <Link2 className="size-4" aria-hidden /> Create a check-in link
        </Button>
      )}
    </div>
  );
}
