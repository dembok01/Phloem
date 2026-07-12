// §12 — email dispatch behind notify(). The in-app notification rows are written
// by the §6 RPCs (the source of truth); this flushes rows that haven't been
// emailed yet (email_sent_at IS NULL), sending via Resend when RESEND_API_KEY is
// set and otherwise console-logging the payload in dev, then stamps email_sent_at
// so reruns are no-ops. Called from the daily cron route.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Admin = SupabaseClient<Database>;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "care@phloem.example";
  if (!key) {
    // Dev fallback (§2/§12): log the full payload; the in-app row already exists.
    console.log(`[notify:dev-email] to=${to} subject="${subject}"\n${text}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    console.error(`[notify] Resend failed (${res.status}): ${await res.text().catch(() => "")}`);
    return false;
  }
  return true;
}

/**
 * Flush pending notification emails. Returns how many were sent. Safe to call
 * repeatedly — only rows with email_sent_at IS NULL are picked up, and each is
 * stamped once sent.
 */
export async function dispatchNotificationEmails(admin: Admin, limit = 100): Promise<{ sent: number }> {
  const { data, error } = await admin
    .from("notifications")
    .select("id, title, body, link, profiles!notifications_user_id_fkey(email)")
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return { sent: 0 };

  let sent = 0;
  for (const n of data) {
    const prof = n.profiles as { email: string } | { email: string }[] | null;
    const email = Array.isArray(prof) ? prof[0]?.email : prof?.email;
    if (!email) continue;
    const link = n.link ? `\n\n${APP_URL}${n.link}` : "";
    const ok = await sendEmail(email, n.title, `${n.body ?? ""}${link}`);
    if (ok) {
      await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    }
  }
  return { sent };
}
