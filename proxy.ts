// ──────────────────────────────────────────────────────────────────────
// WHAT: Runs on the server before EVERY request (Next.js 16 calls this "proxy"; it used to be "middleware").
// WHY:  1) Keeps the Supabase login session fresh (the session lives in browser cookies).
//       2) Sends signed-out visitors to /login, and signed-in visitors away from /login.
// USED BY: Next.js automatically. The `config.matcher` at the bottom decides which URLs it runs for.
// ──────────────────────────────────────────────────────────────────────

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Next.js "proxy" (formerly middleware). Runs before every page: keeps the login session fresh and sends
 *  signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Ask Supabase who is signed in (this also refreshes an expiring session).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");

  // Not signed in and not on a public page -> go to /login (remembering where they wanted to go).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  // Signed-in users don't need the login page, unless it is showing them an error.
  if (user && path === "/login" && !request.nextUrl.searchParams.has("error")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
