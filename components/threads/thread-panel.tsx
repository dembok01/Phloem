// W2 — the conversations on a member, for whichever role is looking.
//
// RLS is the boundary: `threads` is filtered by _thread_visible (migration 0027),
// so a caregiver sees only their family threads, a clinician sees the internal
// threads plus the family ones addressed to them, and the psychologist sees only
// their own confidential channel. This component renders what came back; it makes
// no access decisions.
//
// Reading order is by last activity, and unread threads announce themselves — a
// coordinator opening a member page needs "what changed since I last looked" in one
// glance, not a chronological archive.
import { Lock, MessageSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Monogram, toneForRole } from "@/components/monogram";
import { MessageComposer } from "@/components/threads/message-composer";
import { NewThread } from "@/components/threads/new-thread";
import { ThreadResolveButton } from "@/components/threads/thread-resolve";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { formatDateTimeIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const KIND_META: Record<string, { label: string; icon: typeof MessageSquare; note: string }> = {
  family: {
    label: "With the family",
    icon: MessageSquare,
    note: "The caregiver can read this.",
  },
  care_team: {
    label: "Care team only",
    icon: Users,
    note: "Internal — the family cannot see this.",
  },
  case: { label: "About a health matter", icon: MessageSquare, note: "Internal." },
  psych: { label: "Confidential", icon: Lock, note: "Psychologist and admin only." },
};

export async function ThreadPanel({
  memberId,
  memberFirstName,
  /** which "start a conversation" affordance to offer, if any */
  compose,
  title = "Conversations",
  description,
}: {
  memberId: string;
  memberFirstName?: string;
  compose?: "family" | "care_team" | "none";
  title?: string;
  description?: string;
}) {
  const supabase = await createClient();
  const profile = await getSessionProfile();

  const { data: threads } = await supabase
    .from("threads")
    .select("id, kind, subject, status, audience, created_at, last_message_at")
    .eq("member_id", memberId)
    .order("last_message_at", { ascending: false });

  const list = threads ?? [];

  const [{ data: messages }, { data: reads }] = await Promise.all([
    list.length
      ? supabase
          .from("thread_messages")
          .select("id, thread_id, author_id, body, created_at, profiles(full_name, role)")
          .in(
            "thread_id",
            list.map((t) => t.id),
          )
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    list.length
      ? supabase
          .from("thread_reads")
          .select("thread_id, last_read_at")
          .in(
            "thread_id",
            list.map((t) => t.id),
          )
      : Promise.resolve({ data: [] }),
  ]);

  type Msg = {
    id: string;
    thread_id: string;
    author_id: string | null;
    body: string;
    created_at: string;
    profiles: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
  };

  const byThread = new Map<string, Msg[]>();
  for (const m of (messages ?? []) as Msg[]) {
    const arr = byThread.get(m.thread_id) ?? [];
    arr.push(m);
    byThread.set(m.thread_id, arr);
  }
  const readAt = new Map((reads ?? []).map((r) => [r.thread_id, r.last_read_at]));

  const canCompose = compose && compose !== "none";

  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5"><MessageSquare className="size-5 text-primary" aria-hidden />{title}</CardTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description={
              compose === "family"
                ? "Ask the care team anything about the programme, a plan, or how things are going at home. They reply here."
                : "Questions from the family and internal notes about this member will appear here."
            }
          />
          {canCompose ? (
            <NewThread
              memberId={memberId}
              kind={compose as "family" | "care_team"}
              memberFirstName={memberFirstName}
            />
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="flex items-center gap-2.5"><MessageSquare className="size-5 text-primary" aria-hidden />{title}<Badge variant="muted">{list.length}</Badge></CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {canCompose ? (
          <NewThread
            memberId={memberId}
            kind={compose as "family" | "care_team"}
            memberFirstName={memberFirstName}
          />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {list.map((t) => {
          const meta = KIND_META[t.kind] ?? KIND_META.family;
          const Icon = meta.icon;
          const msgs = byThread.get(t.id) ?? [];
          const since = readAt.get(t.id);
          const unread = msgs.filter(
            (m) => m.author_id !== profile?.user.id && (!since || m.created_at > since),
          ).length;
          const resolved = t.status === "resolved";

          return (
            <article
              key={t.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-background/35 p-4 sm:p-5",
                unread > 0 && "border-primary/30 bg-primary/[0.025] shadow-card",
                resolved && "opacity-80",
              )}
            >
              <header className="flex flex-wrap items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card"><Icon className="size-4 text-primary" aria-hidden /></span>
                <h3 className="min-w-0 break-words font-display text-lg font-semibold">{t.subject}</h3>
                {unread > 0 ? (
                  <Badge variant="default">
                    {unread} new {unread === 1 ? "message" : "messages"}
                  </Badge>
                ) : null}
                {resolved ? <Badge variant="muted">Closed</Badge> : null}
                <span className="ml-auto font-data text-xs text-muted-foreground">
                  {formatDateTimeIST(t.last_message_at)}
                </span>
              </header>

              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {meta.label} · {meta.note}
                {t.audience && t.audience.length > 0
                  ? ` Addressed to the ${t.audience.join(", ")}.`
                  : ""}
              </p>

              <ol className="mt-5 space-y-5">
                {msgs.map((m) => {
                  const author = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
                  const mine = m.author_id === profile?.user.id;
                  return (
                    <li key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
                      <Monogram
                        name={author?.full_name ?? "?"}
                        size="sm"
                        tone={toneForRole(author?.role)}
                      />
                      <div className={cn("min-w-0 flex-1", mine && "flex flex-col items-end")}>
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium">
                            {mine ? "You" : (author?.full_name ?? "Someone")}
                          </span>
                          <span className="font-data text-xs text-muted-foreground">
                            {formatDateTimeIST(m.created_at)}
                          </span>
                        </p>
                        {/* V3 — a message reads as a message. Own messages sit on the
                            brand tint and align right, which is the convention every
                            reader already has from every other messaging app. */}
                        <p
                          className={cn(
                            "mt-1.5 inline-block max-w-[46ch] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap",
                            mine
                              ? "rounded-tr-sm bg-secondary text-secondary-foreground"
                              : "rounded-tl-sm border border-border/50 bg-card shadow-xs",
                          )}
                        >
                          {m.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-5 space-y-3 border-t border-border/70 pt-4">
                <MessageComposer
                  threadId={t.id}
                  memberId={memberId}
                  disabled={resolved}
                  disabledReason="This conversation is closed. Reopen it to add a message."
                />
                <ThreadResolveButton
                  threadId={t.id}
                  memberId={memberId}
                  resolved={resolved}
                  hasUnread={unread > 0}
                />
              </div>
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}
