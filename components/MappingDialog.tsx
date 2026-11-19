"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: The dialog that opens when you click a cell in the WK or SDG grid (browser).
// HOW:  Pick a level 0-3 and write the justification. Level 0 deletes the mapping; 1-3 saves it ("upsert").
//       Saved rows get source = "manual", which removes the purple "AI" tag.
// ──────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ErrorNote, Modal } from "@/components/Modal";
import { LEVEL_LABEL, SDG, WK, type Kind } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";
import type { Mapping, Outcome } from "@/lib/types";

/** Set the level (0–3) and justification of one CO × WK/SDG cell. Level 0 removes it. */
export default function MappingDialog({
  outcome,
  kind,
  num,
  current,
  onClose,
  onSaved,
}: {
  outcome: Outcome;
  kind: Kind;
  num: number;
  current?: Mapping;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = (kind === "WK" ? WK : SDG).find((x) => x.num === num)!;
  const [level, setLevel] = useState(current?.level ?? 2);
  const [text, setText] = useState(current?.justification ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Level 0 = remove the mapping. Otherwise insert it, or update it if it already exists ("upsert").
    const { error } =
      level === 0
        ? await supabase.from("mappings").delete().eq("outcome_id", outcome.id).eq("kind", kind).eq("num", num)
        : await supabase
            .from("mappings")
            .upsert(
              { outcome_id: outcome.id, kind, num, level, justification: text.trim(), source: "manual" },
              { onConflict: "outcome_id,kind,num" },
            );
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
  }

  return (
    <Modal title={`CO${outcome.co_no} × ${kind} ${num}`} onClose={onClose}>
      <p className="rounded-lg bg-stone-50 p-3 text-sm text-slate-700">{outcome.statement}</p>
      <p className="mt-3 text-sm">
        <b>
          {kind}
          {num} – {ref.name}
        </b>
        <span className="block text-xs text-slate-500">{ref.description}</span>
      </p>
      <div className="mt-4">
        <label className="label">Level</label>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={`rounded-lg border px-2 py-2 text-sm ${level === l ? "border-brand bg-brand text-white" : "border-stone-300 hover:border-slate-400"}`}
            >
              <span className="block font-semibold">{l || "–"}</span>
              <span className="text-xs opacity-80">{l ? LEVEL_LABEL[l] : "None"}</span>
            </button>
          ))}
        </div>
      </div>
      {level > 0 && (
        <div className="mt-4">
          <label className="label">Justification (printed in the PDF)</label>
          <textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="One sentence on why this CO supports it." />
        </div>
      )}
      {current?.source === "ai" && <p className="mt-2 text-xs text-violet-700">Suggested by AI. Saving marks it as checked by you.</p>}
      <ErrorNote message={error} />
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy || (!current && level === 0)}>
          {busy ? "Saving…" : level === 0 && current ? "Remove" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
