// ──────────────────────────────────────────────────────────────────────
// WHAT: Finishes sign-in. The email link / Google sign-in come back here with a one-time ?code=.
// HOW:  Exchanges the code for a session (saved in cookies), then redirects to the page the person wanted.
// ──────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** The email link and Google sign-in both come back here with a one-time code. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // Only allow redirects inside this site.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
