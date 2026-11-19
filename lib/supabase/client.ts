// ──────────────────────────────────────────────────────────────────────
// WHAT: Connects to Supabase from code running IN THE BROWSER (client components).
// NOTE: Uses the public URL + publishable key from .env.local. Safe to expose: the database's access
//       rules (row-level security in supabase/schema.sql) decide what each signed-in person may do.
// ──────────────────────────────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for code that runs in the browser (client components). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
