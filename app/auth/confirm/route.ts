// Landing point for the two emailed link types this app mails: password
// recovery, and the current-address half of a sign-in address change. Verifies
// the one-time token with GoTrue, then hands the visitor to a fixed page.
//
// Both the accepted token types and their destinations are a CLOSED map rather
// than read from the query string, so there is no `next` parameter to smuggle an
// off-site redirect through. (`/\evil.com` would clear the obvious "starts with /
// but not //" guard: for http(s), URL parsing folds backslashes into slashes, and
// it resolves to http://evil.com/.) A phisher with any valid token would otherwise
// have had a signed-in bounce off our own domain.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/observe";

export const dynamic = "force-dynamic";

const LANDING = {
  recovery: { ok: "/reset-password", failed: "/reset-password?error=link" },
  // The address change only lands once the new inbox's code is entered too, so
  // this sends the visitor to /account, which shows whichever half is still open.
  email_change: { ok: "/account?ok=email_link", failed: "/account?error=link" },
} as const;

type LinkType = keyof typeof LANDING;

function isLinkType(value: string | null): value is LinkType {
  return value === "recovery" || value === "email_change";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!isLinkType(type)) {
    return NextResponse.redirect(new URL(LANDING.recovery.failed, origin));
  }
  if (!tokenHash) return NextResponse.redirect(new URL(LANDING[type].failed, origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    logEvent(type === "recovery" ? "auth.reset.verify_failed" : "auth.email_change.verify_failed", {
      reason: error.message,
    });
    return NextResponse.redirect(new URL(LANDING[type].failed, origin));
  }

  // If this browser is signed in, sync the profile copy now; otherwise the shell
  // heals it on the next page view. Idempotent, and never blocks the redirect.
  if (type === "email_change") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.rpc("sync_my_email");
  }

  return NextResponse.redirect(new URL(LANDING[type].ok, origin));
}
