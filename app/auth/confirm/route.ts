// Landing point for the emailed recovery link. Verifies the one-time token with
// GoTrue, which sets the @supabase/ssr session cookies, then hands the visitor to
// the page that actually collects the new password.
//
// Both the token type and the destination are fixed rather than read from the
// query string. `recovery` is the one link type this app mails, and the one page
// worth landing on is /reset-password — so there is no `next` parameter to
// smuggle an off-site redirect through. (`/\evil.com` would clear the obvious
// "starts with / but not //" guard: for http(s), URL parsing folds backslashes
// into slashes, and it resolves to http://evil.com/.) A phisher with any valid
// recovery token would otherwise have had a signed-in bounce off our own domain.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/observe";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const failed = NextResponse.redirect(new URL("/reset-password?error=link", origin));
  if (!tokenHash || type !== "recovery") return failed;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error) {
    logEvent("auth.reset.verify_failed", { reason: error.message });
    return failed;
  }

  return NextResponse.redirect(new URL("/reset-password", origin));
}
