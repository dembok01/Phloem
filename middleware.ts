import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { allowedPrefix, APP_PREFIXES, roleHome } from "@/lib/permissions";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session (required for SSR) and identify the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // `/c/<token>` is the W3 family check-in link: deliberately reachable with no
  // session, because the families most worth reaching are the ones who will not log
  // in. It is safe to leave open because the page itself holds no data — it calls
  // two `anon`-executable security-definer RPCs that validate the token and return
  // a first name and nothing else (migration 0029).
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/api/cron");

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  // Suspended (or profile-less) → signed out with notice. auth_role() already
  // fails closed in the database; this is the UX mirror.
  if (!profile || profile.status === "suspended") {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?notice=suspended";
    return NextResponse.redirect(url);
  }

  const home = roleHome(profile.role);
  const prefix = allowedPrefix(profile.role);

  if (pathname === "/" || pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Keep each role inside its own §10 shell (cosmetic; RLS is the boundary).
  const inGuardedSection = APP_PREFIXES.some((p) => pathname.startsWith(p));
  if (inGuardedSection && !pathname.startsWith(prefix)) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
