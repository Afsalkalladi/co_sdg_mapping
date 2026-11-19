"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: Dialogs for course outcomes (browser):
//   OutcomeDialog       -> add or edit ONE CO (number, K-level, statement, module title, topics).
//   PasteOutcomesDialog -> paste MANY COs at once; parseOutcomeLines() understands "CO1: text K2",
//                          tab-separated rows copied from Word/Excel, or plain lines.
// ──────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ErrorNote, Modal } from "@/components/Modal";
import { K_LEVELS } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";
import type { Outcome } from "@/lib/types";

/** Add or edit one course outcome. */
export function OutcomeDialog({
  subjectId,
  outcome,
  outcomes,
  onClose,
  onSaved,
}: {
  subjectId: number;
  outcome?: Outcome;
  outcomes: Outcome[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const next = Math.max(0, ...outcomes.map((o) => o.co_no)) + 1;
  const [coNo, setCoNo] = useState(String(outcome?.co_no ?? next));
  const [k, setK] = useState(outcome?.k_level ?? "");
  const [statement, setStatement] = useState(outcome?.statement ?? "");
  const [title, setTitle] = useState(outcome?.title ?? "");
  const [topics, setTopics] = useState(outcome?.topics ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = {
      co_no: Number(coNo),
      k_level: k || null,
      statement: statement.trim(),
      title: title.trim(),
      topics: topics.trim(),
    };
    const supabase = createClient();
    // Editing -> update the existing row; adding -> insert a new CO for this subject.
    const { error } = outcome
      ? await supabase.from("outcomes").update(values).eq("id", outcome.id)
      : await supabase.from("outcomes").insert({ ...values, subject_id: subjectId });
    setBusy(false);
    if (error) return setError(error.code === "23505" ? `CO${values.co_no} already exists in this subject.` : error.message);
    onSaved();
  }

  return (
    <Modal title={outcome ? `Edit CO${outcome.co_no}` : "Add course outcome"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">CO number</label>
            <input className="input" type="number" min={1} max={20} required value={coNo} onChange={(e) => setCoNo(e.target.value)} />
          </div>
          <div>
            <label className="label">Knowledge level</label>
            <select className="input" value={k} onChange={(e) => setK(e.target.value)}>
              <option value="">–</option>
              {K_LEVELS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Course outcome statement</label>
          <textarea className="input min-h-20" required value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Describe the transient and steady-state aspects of electric drives" />
        </div>
        <div>
          <label className="label">Module title (optional, printed in bold above the WK table)</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fundamentals and dynamics of drives" />
        </div>
        <div>
          <label className="label">Module topics (optional, printed after the title; also helps the AI)</label>
          <textarea className="input min-h-20" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Dynamics of motor-load systems - fundamental torque equations - …" />
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Parsed = { co_no: number; statement: string; k_level: string | null };

/** Reads one CO per line, e.g. "CO1: Describe … K2", "CO1<tab>Describe …<tab>K2" or just the statement. */
export function parseOutcomeLines(text: string, startAt: number): Parsed[] {
  const out: Parsed[] = [];
  let auto = startAt;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    let co: number | null = null;
    let k: string | null = null;

    // Copied from a table (Word/Excel): cells are separated by tabs.
    // Find the cell that looks like a CO number, the one that looks like K1–K6, and use the longest cell as the statement.
    if (line.includes("\t")) {
      const cells = line.split("\t").map((c) => c.trim()).filter(Boolean);
      const coCell = cells.find((c) => /^(co\s*-?\s*)?\d{1,2}$/i.test(c));
      const kCell = cells.find((c) => /^\(?k[1-6]\)?$/i.test(c));
      if (coCell) co = Number(coCell.replace(/\D/g, ""));
      if (kCell) k = kCell.replace(/[()]/g, "").toUpperCase();
      line = cells.filter((c) => c !== coCell && c !== kCell).sort((a, b) => b.length - a.length)[0] ?? "";
    } else {
      // Plain text: optional "CO1:" at the start, optional "K2" / "(K2)" at the end.
      const m = line.match(/^co\s*-?\s*(\d{1,2})\s*[:.\-–)]?\s*(.*)$/i);
      if (m) {
        co = Number(m[1]);
        line = m[2];
      }
      const km = line.match(/[\s,;(\[–-]*\(?\b(k[1-6])\b\)?\]?\s*$/i);
      if (km) {
        k = km[1].toUpperCase();
        line = line.slice(0, km.index).trim();
      }
    }
    if (!line) continue;
    if (co === null) co = auto;
    auto = co + 1;
    out.push({ co_no: co, statement: line, k_level: k });
  }
  return out;
}

/** Paste many COs at once (from the syllabus, Word or Excel). Existing CO numbers are updated. */
export function PasteOutcomesDialog({
  subjectId,
  outcomes,
  onClose,
  onSaved,
}: {
  subjectId: number;
  outcomes: Outcome[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startAt = Math.max(0, ...outcomes.map((o) => o.co_no)) + 1;
  const parsed = useMemo(() => parseOutcomeLines(text, outcomes.length ? startAt : 1), [text, startAt, outcomes.length]);
  const existing = new Set(outcomes.map((o) => o.co_no));
  const bad = parsed.filter((p) => p.co_no < 1 || p.co_no > 20);
  const dup = parsed.filter((p, i) => parsed.findIndex((q) => q.co_no === p.co_no) !== i);

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Save all pasted COs: existing CO numbers are updated, new ones are added.
    // Rows without a K-level are saved separately so an existing K-level isn't wiped.
    const withK = parsed.filter((p) => p.k_level).map((p) => ({ subject_id: subjectId, ...p }));
    const withoutK = parsed.filter((p) => !p.k_level).map((p) => ({ subject_id: subjectId, co_no: p.co_no, statement: p.statement }));
    for (const rows of [withK, withoutK]) {
      if (!rows.length) continue;
      const { error } = await supabase.from("outcomes").upsert(rows, { onConflict: "subject_id,co_no" });
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Modal title="Paste course outcomes" onClose={onClose} wide>
      <p className="text-sm text-slate-600">
        One CO per line. These all work: <code className="rounded bg-stone-100 px-1">CO1: Describe … K2</code>,{" "}
        <code className="rounded bg-stone-100 px-1">CO1 ⇥ Describe … ⇥ K2</code> (copied from a table), or just the statement.
      </p>
      <textarea
        className="input mt-3 min-h-44 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"CO1 Describe the transient and steady-state aspects of electric drives K2\nCO2 Apply the appropriate configuration of controlled rectifiers for the speed control of DC motors K3"}
      />
      {parsed.length > 0 && (
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {parsed.map((p, i) => (
                <tr key={i}>
                  <td className="w-14 px-2 py-1.5 font-semibold">CO{p.co_no}</td>
                  <td className="px-2 py-1.5">{p.statement}</td>
                  <td className="w-10 px-2 py-1.5 text-slate-500">{p.k_level ?? "–"}</td>
                  <td className="w-20 px-2 py-1.5 text-xs text-slate-500">{existing.has(p.co_no) ? "updates" : "new"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bad.length > 0 && <ErrorNote message="CO numbers must be between 1 and 20." />}
      {dup.length > 0 && <ErrorNote message={`CO${dup[0].co_no} appears more than once.`} />}
      <ErrorNote message={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !parsed.length || bad.length > 0 || dup.length > 0}>
          {busy ? "Saving…" : `Save ${parsed.length || ""} CO${parsed.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}
