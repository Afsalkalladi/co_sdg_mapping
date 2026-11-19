// ──────────────────────────────────────────────────────────────────────
// WHAT: One subject's page ("/subjects/12"). Runs on the SERVER.
// HOW:  Loads the subject, its COs, their WK/SDG mappings and the college name, then hands everything to
//       <SubjectEditor> (browser) which shows it and handles editing, "Map with AI" and "Export PDF".
//       aiEnabled tells the page whether an AI key is configured (the key itself never leaves the server).
// ──────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import SubjectEditor from "@/components/SubjectEditor";
import { aiConfigured } from "@/lib/ai-server";
import { canEdit, requireProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Mapping, Outcome, Subject } from "@/lib/types";

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: subject } = await supabase.from("subjects").select("id, scheme, semester, code, name, department, updated_at").eq("id", id).maybeSingle();
  if (!subject) notFound();

  const [outcomesRes, settingsRes] = await Promise.all([
    supabase.from("outcomes").select("*").eq("subject_id", id).order("co_no"),
    supabase.from("settings").select("college_name").single(),
  ]);
  const outcomes = (outcomesRes.data ?? []) as Outcome[];
  const { data: mappings } = outcomes.length
    ? await supabase
        .from("mappings")
        .select("outcome_id, kind, num, level, justification, source")
        .in("outcome_id", outcomes.map((o) => o.id))
    : { data: [] };

  return (
    <SubjectEditor
      subject={subject as Subject}
      outcomes={outcomes}
      mappings={(mappings ?? []) as Mapping[]}
      college={(settingsRes.data?.college_name as string | undefined) ?? ""}
      canEdit={canEdit(profile)}
      isAdmin={profile.role === "admin"}
      aiEnabled={aiConfigured()}
    />
  );
}
