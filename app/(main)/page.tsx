// ──────────────────────────────────────────────────────────────────────
// WHAT: The Subjects page ("/"). Runs on the SERVER.
// HOW:  Loads every subject (with CO and mapping counts) from the `subject_summary` database view and hands
//       them to <SubjectList>, which runs in the browser and does the scheme/semester filtering.
//       ?scheme=...&sem=... in the address pre-selects the dropdowns.
// ──────────────────────────────────────────────────────────────────────

import SubjectList, { type SubjectRow } from "@/components/SubjectList";
import { canEdit, requireProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ scheme?: string; sem?: string }> }) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("subject_summary").select("*").order("semester").order("code");
  return (
    <SubjectList
      rows={(data ?? []) as SubjectRow[]}
      canEdit={canEdit(profile)}
      initialScheme={sp.scheme ?? null}
      initialSem={sp.sem ?? null}
    />
  );
}
