// ──────────────────────────────────────────────────────────────────────
// WHAT: The Settings page ("/settings"), admins only. Runs on the SERVER.
// HOW:  requireAdmin() sends non-admins back to "/". Loads the settings row and all people, then shows <SettingsPanel>.
// ──────────────────────────────────────────────────────────────────────

import SettingsPanel from "@/components/SettingsPanel";
import { requireAdmin } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Settings } from "@/lib/types";

export default async function SettingsPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [settings, profiles] = await Promise.all([
    supabase.from("settings").select("college_name, allowed_email_domain, psos").single(),
    supabase.from("profiles").select("*").order("created_at"),
  ]);
  return (
    <SettingsPanel
      meId={me.id}
      settings={(settings.data ?? { college_name: "", allowed_email_domain: null, psos: [] }) as Settings}
      profiles={(profiles.data ?? []) as Profile[]}
    />
  );
}
