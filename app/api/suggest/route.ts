// ──────────────────────────────────────────────────────────────────────
// WHAT: The AI mapping endpoint: POST /api/suggest. Runs on the SERVER (so the AI key stays secret).
//       Maps the requested COs to WK, SDG, PO and PSO in ONE AI request.
// FLOW: 1) Check the person is signed in and is an editor or admin.
//       2) Load the requested COs of the subject, and the PSO statements from Settings.
//       3) Build the prompt (lib/ai.ts) and send it to the AI (lib/ai-server.ts).
//       4) Read the AI's CSV answer (lib/ai.ts -> parseAiTable).
//       5) Save it with the database function replace_mappings (replaces only those COs' WK/SDG/PO/PSO rows).
// CALLED BY: components/SubjectEditor.tsx -> runAi(), a few COs at a time.
// ──────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { buildPrompt, parseAiTable } from "@/lib/ai";
import { AiError, askAi } from "@/lib/ai-server";
import { KINDS } from "@/lib/reference";
import { createClient } from "@/lib/supabase/server";
import type { Outcome } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120; // seconds (on Vercel; needs a plan/setting that allows it)

/**
 * POST { subjectId: number, coNos: number[] }
 * Asks the AI to map these COs to WK1–9 and SDG1–17, then saves the result
 * (replacing only these COs' mappings). Keep each call to a few COs; the page
 * splits larger requests into batches.
 */
export async function POST(request: Request) {
  // 1) Who is calling? Must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  //    ...and must be an editor or admin.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "editor"].includes(profile.role)) {
    return NextResponse.json({ error: "You don't have permission to edit mappings." }, { status: 403 });
  }

  // 2) Read and check the request: which subject, which CO numbers (max 6 per call).
  let body: { subjectId?: number; coNos?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const subjectId = Number(body.subjectId);
  const coNos = Array.isArray(body.coNos) ? body.coNos.map(Number).filter((n) => Number.isInteger(n)) : [];
  if (!Number.isInteger(subjectId) || !coNos.length || coNos.length > 6) {
    return NextResponse.json({ error: "Send a subject and 1–6 CO numbers." }, { status: 400 });
  }

  // 3) Load the subject and the requested COs from the database.
  const [{ data: subject }, { data: outcomes }, { data: settings }] = await Promise.all([
    supabase.from("subjects").select("code, name, department").eq("id", subjectId).maybeSingle(),
    supabase.from("outcomes").select("*").eq("subject_id", subjectId).in("co_no", coNos),
    supabase.from("settings").select("psos").single(),
  ]);
  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  const cos = (outcomes ?? []) as Outcome[];
  if (!cos.length) return NextResponse.json({ error: "Those COs don't exist." }, { status: 404 });
  // The programme's PSO statements (Settings). Without them, PSOs are left out of the mapping.
  const psos = ((settings?.psos as string[] | null) ?? []).filter((t) => t.trim());
  const kinds = KINDS.filter((k) => k !== "PSO" || psos.length > 0);

  try {
    // 4) Build the prompt, send it to the AI, wait for the answer.
    const answer = await askAi(buildPrompt({ ...subject, outcomes: cos, psos }, kinds));
    // 5) Read the AI's CSV into rows (bad lines become warnings).
    const parsed = parseAiTable(
      answer,
      cos.map((o) => o.co_no),
      psos.length,
    );
    if (!parsed.rows.length) {
      return NextResponse.json(
        { error: "The AI's answer couldn't be read. Try again.", detail: parsed.warnings.slice(0, 5) },
        { status: 502 },
      );
    }
    // 6) Save: replaces only THESE COs' WK/SDG/PO/PSO mappings, all in one database transaction.
    const { error } = await supabase.rpc("replace_mappings", {
      p_subject_id: subjectId,
      p_kinds: kinds,
      p_rows: parsed.rows.map((r) => ({ ...r, source: "ai" })),
      p_co_nos: cos.map((o) => o.co_no),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: parsed.rows.length, warnings: parsed.warnings });
  } catch (e) {
    // AI problems (slow, limit reached, bad key) go back to the page with a friendly message.
    if (e instanceof AiError) {
      return NextResponse.json(
        { error: e.message, retryAfter: e.retryAfter },
        { status: e.status, headers: e.retryAfter ? { "Retry-After": String(e.retryAfter) } : undefined },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
