"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: The manual AI route, used when no AI key is configured (or to paste a table by hand).
//       Works for all four frameworks: WK, SDG, PO and PSO.
//   PromptDialog  -> shows a ready-made prompt to copy into ChatGPT / Gemini / Claude.
//   PasteAiDialog -> paste (or upload) the AI's table; it is read with parseAiTable and saved with replace_mappings.
// ──────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ErrorNote, Modal } from "@/components/Modal";
import { buildPrompt, CSV_HEADER, parseAiTable } from "@/lib/ai";
import { KINDS, type Kind } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";
import type { Outcome, Subject } from "@/lib/types";

/** Step 2: show the prompt to paste into ChatGPT, Claude, Gemini, … */
export function PromptDialog({
  subject,
  outcomes,
  psos,
  onClose,
}: {
  subject: Subject;
  outcomes: Outcome[];
  psos: string[];
  onClose: () => void;
}) {
  // Which frameworks to ask for (PSO only when Settings has PSO statements). All are ticked at first.
  const available = KINDS.filter((k) => k !== "PSO" || psos.length > 0);
  const [kinds, setKinds] = useState<Kind[]>(available);
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => buildPrompt({ ...subject, outcomes, psos }, kinds), [subject, outcomes, psos, kinds]);
  const toggle = (k: Kind) =>
    setKinds((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : KINDS.filter((x) => x === k || cur.includes(x))));

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      (document.getElementById("ai-prompt") as HTMLTextAreaElement | null)?.select();
    }
  }

  return (
    <Modal title="Ask an AI to map the COs" onClose={onClose} wide>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Copy the prompt below.</li>
        <li>Paste it into ChatGPT, Claude, Gemini or any similar AI chat.</li>
        <li>Copy the CSV table it answers with, then use <b>Paste AI result</b> on this page.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-500">Map to:</span>
        {available.map((k) => (
          <label key={k} className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(k)} className="accent-brand" />
            {k}
          </label>
        ))}
      </div>
      <textarea id="ai-prompt" readOnly className="input mt-3 min-h-64 font-mono text-xs" value={prompt} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-primary" onClick={copy}>
          {copied ? "Copied ✓" : "Copy prompt"}
        </button>
      </div>
    </Modal>
  );
}

/** Step 3: paste (or upload) the AI's table and save it as this subject's mappings. */
export function PasteAiDialog({
  subjectId,
  outcomes,
  psoCount,
  existing,
  onClose,
  onSaved,
}: {
  subjectId: number;
  outcomes: Outcome[];
  /** How many PSOs are defined in Settings (PSO numbers above this are rejected). */
  psoCount: number;
  existing: Record<Kind, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cos = useMemo(() => outcomes.map((o) => o.co_no), [outcomes]);
  const result = useMemo(() => (text.trim() ? parseAiTable(text, cos, psoCount) : null), [text, cos, psoCount]);

  async function loadFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer());
        setText(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      } else {
        setText(await f.text());
      }
    } catch (e) {
      setError(`Couldn't read the file: ${(e as Error).message}`);
    }
  }

  async function save() {
    if (!result?.rows.length) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("replace_mappings", {
      p_subject_id: subjectId,
      p_kinds: result.kinds,
      p_rows: result.rows.map((r) => ({ ...r, source: "ai" })),
    });
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
  }

  const perCo = (k: Kind) => cos.map((c) => result?.rows.filter((r) => r.co_no === c && r.kind === k).length ?? 0);

  return (
    <Modal title="Paste AI result" onClose={onClose} wide>
      <p className="text-sm text-slate-600">
        Paste the table the AI answered with (the whole reply is fine), or upload it as a .csv or .xlsx file. It needs the columns{" "}
        <code className="rounded bg-stone-100 px-1">{CSV_HEADER}</code>.
      </p>
      <textarea
        className="input mt-3 min-h-44 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`${CSV_HEADER}\nCO1,WK,2,3,"Requires deriving and solving the mathematical model of the system."\nCO1,PO,1,3,"Applies engineering fundamentals to analyse the system."`}
      />
      <input type="file" accept=".csv,.txt,.xlsx,.xls" className="mt-2 text-sm" onChange={(e) => loadFile(e.target.files?.[0])} />

      {result && (
        <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
          {result.rows.length > 0 ? (
            <>
              <p>
                Found <b>{result.rows.length}</b> mappings:
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pr-3 text-left font-medium" />
                      {cos.map((c) => (
                        <th key={c} className="px-2 font-medium">
                          CO{c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {KINDS.filter((k) => k !== "PSO" || psoCount > 0).map((k) => (
                      <tr key={k}>
                        <td className="pr-3 font-medium">{k}</td>
                        {perCo(k).map((n, i) => (
                          <td key={i} className={`px-2 text-center ${n ? "" : "text-slate-400"}`}>
                            {n}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-slate-600">
                Saving <b>replaces</b> this subject’s current {result.kinds.join(", ")} mappings
                {result.kinds.some((k) => existing[k] > 0) &&
                  ` (${result.kinds.map((k) => `${existing[k]} ${k}`).join(", ")} now)`}
                . You can still edit any cell afterwards.
              </p>
            </>
          ) : (
            <p className="text-red-700">No mappings could be read.</p>
          )}
          {result.warnings.length > 0 && (
            <details className="mt-2" open={!result.rows.length}>
              <summary className="cursor-pointer text-amber-700">
                {result.warnings.length} line{result.warnings.length === 1 ? "" : "s"} skipped
              </summary>
              <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-xs text-slate-600">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <ErrorNote message={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !result?.rows.length}>
          {busy ? "Saving…" : "Save mappings"}
        </button>
      </div>
    </Modal>
  );
}
