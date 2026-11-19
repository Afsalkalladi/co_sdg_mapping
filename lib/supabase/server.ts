// ──────────────────────────────────────────────────────────────────────
// WHAT: Connects to Supabase from code running ON THE SERVER (pages, API routes).
// HOW:  Reads the login session from cookies, so every query runs AS the signed-in person and the
//       database's access rules apply to them.
// ──────────────────────────────────────────────────────────────────────

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client for server components, route handlers and server actions.
 *  It acts as the signed-in user, so the database's row-level security applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component: cookies can't be set there.
            // The middleware refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    },
  );
}
