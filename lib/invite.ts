// Invite link helper. In dev (§15 Phase 2) the accept URL is surfaced as a
// copyable link in the admin UI instead of an email — no mail server needed.
export function inviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}

/** Pending until claimed, then used; expired if the 7-day window lapsed unused. */
export type InviteState = "pending" | "used" | "expired";

export function inviteState(row: { used_at: string | null; expires_at: string }): InviteState {
  if (row.used_at) return "used";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "pending";
}
