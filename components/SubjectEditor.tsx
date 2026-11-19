"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: Everything on a subject's page (browser): title + buttons, the COs list, the WK/SDG grids
//       with justifications, and all dialogs (edit CO, paste COs, edit a cell, confirm delete, ...).
// KEY FUNCTIONS:
//   runAi(coNos)  -> "Map with AI": calls /api/suggest for 2 COs at a time, shows progress, retries if slow/limited.
//   exportPdf()   -> builds the PDF in the browser with lib/pdf/report.ts and downloads it.
// DATA: comes from the server page as props. After any change we call router.refresh() to reload it.
// ──────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PasteAiDialog, PromptDialog } from "@/components/AiDialogs";
import MappingDialog from "@/components/MappingDialog";
import { ConfirmDialog } from "@/components/Modal";
import { OutcomeDialog, PasteOutcomesDialog } from "@/components/OutcomeDialogs";
import { SubjectForm, listHref } from "@/components/SubjectList";
import { SDG, WK, type Kind } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";
import type { Mapping, Outcome, Subject } from "@/lib/types";

type Props = {
  subject: Subject;
  outcomes: Outcome[];
  mappings: Mapping[];
  college: string;
  canEdit: boolean;
  isAdmin: boolean;
  aiEnabled: boolean;
};

// Which pop-up is open (only one at a time). `null` = none.
type Dialog =
  | { kind: "details" }
  | { kind: "deleteSubject" }
  | { kind: "outcome"; outcome?: Outcome }
  | { kind: "deleteOutcome"; outcome: Outcome }
  | { kind: "pasteOutcomes" }
  | { kind: "prompt" }
  | { kind: "pasteAi" }
  | { kind: "mapping"; outcome: Outcome; mapKind: Kind; num: number }
  | { kind: "remapAll" }
  | null;

// What the purple/green/red AI status box shows while and after mapping.
type AiStatus = { running: boolean; message: string; error?: string; warnings?: string[] };
const BATCH = 2; // COs per AI request
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CELL = ["bg-stone-100 text-slate-400", "bg-lv1 text-slate-800", "bg-lv2 text-white", "bg-lv3 text-white"];

export default function SubjectEditor(p: Props) {
  const router = useRouter();
  // ── Page state ──
  // dialog: open pop-up · tab: WK or SDG grid · exporting: PDF being made · ai: AI status box
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<Kind>("WK");
  const [exporting, setExporting] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);

  // Quick lookup of a mapping by "outcomeId:WK:3" so each grid cell finds its value instantly.
  const byKey = useMemo(() => new Map(p.mappings.map((m) => [`${m.outcome_id}:${m.kind}:${m.num}`, m])), [p.mappings]);
  // outcome id -> CO number (the PDF works with CO numbers).
  const coNoById = useMemo(() => new Map(p.outcomes.map((o) => [o.id, o.co_no])), [p.outcomes]);
  const count = (k: Kind) => p.mappings.filter((m) => m.kind === k).length;
  const close = () => setDialog(null);
  // After any save: close the pop-up and reload the data from the server.
  const saved = () => {
    setDialog(null);
    router.refresh();
  };
  const mapped = count("WK") + count("SDG") > 0;
  /** "Map with AI": without an AI key, fall back to the copy-prompt dialog. */
  // The "Map with AI" / "Re-map with AI" button.
  // No AI key -> show the copy-prompt dialog. Already mapped -> ask before replacing. Otherwise -> run.
  const startMapping = () => {
    if (!p.aiEnabled) return setDialog({ kind: "prompt" });
    if (mapped) return setDialog({ kind: "remapAll" });
    void runAi(p.outcomes.map((o) => o.co_no));
  };

  /** Asks the AI to map these COs (in small batches) and saves the results. */
  async function runAi(coNos: number[]) {
    const list = [...new Set(coNos)].sort((a, b) => a - b);
    // Split the COs into small batches (BATCH = 2) so each AI answer is short and fast.
    const batches: number[][] = [];
    for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH));
    const warnings: string[] = [];
    let saved = 0;
    try {
      for (let i = 0; i < batches.length; i++) {
        const b = batches[i];
        const label = b.length > 1 ? `CO${b[0]}–CO${b[b.length - 1]}` : `CO${b[0]}`;
        setAi({ running: true, message: `AI is mapping ${label} to WK and SDG…${batches.length > 1 ? ` (${i + 1} of ${batches.length})` : ""}` });
        for (let attempt = 0; ; attempt++) {
          // Ask our server route to map this batch (the server talks to the AI and saves the result).
          const res = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subjectId: p.subject.id, coNos: b }),
          });
          const j = await res.json().catch(() => ({}));
          // 504 = the AI was too slow -> try once more.  429 = free-tier limit -> wait, then retry (twice).
          if (res.status === 504 && attempt < 1) {
            setAi({ running: true, message: `The AI was slow; trying ${label} again…` });
            continue;
          }
          if (res.status === 429 && attempt < 2) {
            const wait = Math.min(60, Number(j.retryAfter) || 20);
            setAi({ running: true, message: `The free AI limit was reached; trying again in ${wait} seconds…` });
            await sleep(wait * 1000);
            continue;
          }
          if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
          saved += j.saved ?? 0;
          warnings.push(...(j.warnings ?? []));
          break;
        }
        // Show this batch's results in the grids straight away.
        router.refresh();
      }
      setAi({ running: false, message: `AI mapped ${list.length} CO${list.length === 1 ? "" : "s"} (${saved} mappings). Please review them below.`, warnings });
    } catch (e) {
      setAi({ running: false, message: "", error: (e as Error).message });
      router.refresh();
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      // Load the PDF code only when needed, build the PDF from the current data, then download it.
      const { buildReport } = await import("@/lib/pdf/report");
      const bytes = await buildReport({
        college: p.college,
        department: p.subject.department,
        code: p.subject.code,
        name: p.subject.name,
        outcomes: p.outcomes,
        mappings: p.mappings.map((m) => ({ ...m, co_no: coNoById.get(m.outcome_id) ?? 0 })),
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.subject.code.replace(/[^\w-]+/g, "_")}_CO_WK_SDG_Mapping.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      alert(`Could not create the PDF: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  // Columns of the grid that is showing: WK1–9 or SDG1–17.
  const items = tab === "WK" ? WK : SDG;
  const hasCos = p.outcomes.length > 0;

  return (
    <div className="space-y-6">
      {/* Title and actions */}
      <div>
        <Link href={listHref(p.subject.scheme, p.subject.semester ?? "all")} className="text-sm text-slate-500 hover:text-slate-900">
          ← {p.subject.scheme || "Subjects"}
          {p.subject.semester ? ` · Semester ${p.subject.semester}` : ""}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{p.subject.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {p.subject.code}
              {p.subject.department && ` · ${p.subject.department}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.canEdit && (
              <>
                <button className="btn" onClick={() => setDialog({ kind: "details" })}>
                  Edit details
                </button>
                <button className="btn btn-danger" onClick={() => setDialog({ kind: "deleteSubject" })}>
                  Delete
                </button>
              </>
            )}
            {p.canEdit && (
              <button
                className={`btn ${mapped ? "" : "btn-primary"}`}
                onClick={startMapping}
                disabled={!hasCos || ai?.running}
                title={hasCos ? "Map every CO to WK and SDG with AI" : "Add course outcomes first"}
              >
                {ai?.running ? "Mapping…" : mapped ? "Re-map with AI" : "Map with AI"}
              </button>
            )}
            <button className={`btn ${mapped || !p.canEdit ? "btn-primary" : ""}`} onClick={exportPdf} disabled={!hasCos || exporting}>
              {exporting ? "Creating PDF…" : "Export PDF"}
            </button>
          </div>
        </div>
        {!p.college && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            The college name for the PDF header isn’t set yet.{" "}
            {p.isAdmin ? (
              <Link href="/settings" className="underline">
                Set it in Settings
              </Link>
            ) : (
              "Ask an admin to set it in Settings."
            )}
          </p>
        )}
      </div>

      {/* How it works / AI status */}
      {p.canEdit && (
        <div className="space-y-2">
          {p.aiEnabled ? (
            !hasCos && (
              <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                Add the course outcomes below (or import them from Excel on the Subjects page), then press <b>Map with AI</b>. Review
                the WK and SDG grids and press <b>Export PDF</b>.
              </p>
            )
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              AI mapping is off because no AI key is set (<code>AI_API_KEY</code> in <code>.env.local</code>; see the README).
              Meanwhile you can{" "}
              <button className="underline disabled:no-underline disabled:opacity-50" disabled={!hasCos} onClick={() => setDialog({ kind: "prompt" })}>
                copy a prompt
              </button>{" "}
              for any AI chat and{" "}
              <button className="underline disabled:no-underline disabled:opacity-50" disabled={!hasCos} onClick={() => setDialog({ kind: "pasteAi" })}>
                paste its answer
              </button>
              .
            </p>
          )}
          {ai && (
            <div
              className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                ai.error ? "border-red-200 bg-red-50 text-red-800" : ai.running ? "border-violet-200 bg-violet-50 text-violet-900" : "border-green-200 bg-green-50 text-green-900"
              }`}
            >
              {ai.running && <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />}
              <div className="min-w-0 flex-1">
                {ai.error ? <>AI mapping failed: {ai.error}</> : ai.message}
                {!!ai.warnings?.length && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer">{ai.warnings.length} AI lines were skipped</summary>
                    <ul className="list-disc pl-5">
                      {ai.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              {!ai.running && (
                <button className="shrink-0 text-xs opacity-70 hover:opacity-100" onClick={() => setAi(null)}>
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Course outcomes */}
      <section className="card !p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          <h2 className="font-semibold">Course outcomes</h2>
          {p.canEdit && (
            <div className="flex gap-2">
              <button className="btn" onClick={() => setDialog({ kind: "pasteOutcomes" })}>
                Paste COs
              </button>
              <button className="btn" onClick={() => setDialog({ kind: "outcome" })}>
                + Add CO
              </button>
            </div>
          )}
        </div>
        {hasCos ? (
          <ul className="mt-3 divide-y divide-stone-200">
            {p.outcomes.map((o) => (
              <li key={o.id} className="flex gap-3 px-4 py-3 sm:px-5">
                <div className="w-12 shrink-0">
                  <div className="font-semibold">CO{o.co_no}</div>
                  <div className="text-xs text-slate-500">{o.k_level ?? "—"}</div>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p>{o.statement}</p>
                  {(o.title || o.topics) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {o.title && <b className="font-semibold text-slate-600">{o.title.toUpperCase()}</b>}
                      {o.title && o.topics && " – "}
                      {o.topics}
                    </p>
                  )}
                </div>
                {p.canEdit && (
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button className="text-slate-500 hover:text-brand" onClick={() => setDialog({ kind: "outcome", outcome: o })}>
                      Edit
                    </button>
                    <button className="text-slate-500 hover:text-red-700" onClick={() => setDialog({ kind: "deleteOutcome", outcome: o })}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 pt-2 text-sm text-slate-500">No course outcomes yet.</p>
        )}
      </section>

      {/* WK / SDG mapping */}
      {hasCos && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-stone-100 p-1">
              {(["WK", "SDG"] as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-md px-4 py-1 text-sm font-medium ${tab === k ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  CO–{k} <span className="text-xs text-slate-400">({count(k)})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500">{p.canEdit ? "Select a cell to change it." : "3 High · 2 Medium · 1 Low"}</span>
              {p.canEdit && (
                <button className="text-xs text-slate-500 hover:text-slate-900" onClick={() => setDialog({ kind: "pasteAi" })}>
                  Paste AI table…
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="border-separate border-spacing-[3px] text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white" />
                  {items.map((it) => (
                    <th key={it.num} className="min-w-8 px-0.5 pb-1 font-semibold text-slate-600" title={`${tab}${it.num}: ${it.name}`}>
                      {tab === "WK" ? `WK${it.num}` : it.num}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.outcomes.map((o) => (
                  <tr key={o.id}>
                    <th className="sticky left-0 z-10 bg-white pr-2 text-left font-semibold" title={o.statement}>
                      CO{o.co_no}
                    </th>
                    {items.map((it) => {
                      const m = byKey.get(`${o.id}:${tab}:${it.num}`);
                      const v = m?.level ?? 0;
                      return (
                        <td key={it.num} className="p-0">
                          {/* One grid cell: shows the level (– / 1 / 2 / 3); editors click it to open MappingDialog. */}
                          <button
                            disabled={!p.canEdit}
                            onClick={() => setDialog({ kind: "mapping", outcome: o, mapKind: tab, num: it.num })}
                            title={`CO${o.co_no} × ${tab}${it.num} (${it.name})${m?.justification ? `: ${m.justification}` : ""}`}
                            className={`h-8 w-full min-w-8 rounded font-semibold enabled:hover:ring-2 enabled:hover:ring-slate-400 disabled:cursor-default ${CELL[v]}`}
                          >
                            {v || "–"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Justifications, as they will appear in the PDF */}
          <div className="mt-6 space-y-4">
            {p.outcomes.map((o) => {
              const list = items
                .map((it) => ({ it, m: byKey.get(`${o.id}:${tab}:${it.num}`) }))
                .filter((x) => x.m);
              return (
                <div key={o.id}>
                  <h3 className="text-sm font-semibold">
                    CO{o.co_no} <span className="font-normal text-slate-500">– {o.statement}</span>
                  </h3>
                  {list.length ? (
                    <ul className="mt-1.5 space-y-1">
                      {list.map(({ it, m }) => (
                        <li key={it.num} className="flex items-start gap-3 rounded-lg bg-stone-50 px-3 py-1.5 text-sm">
                          <span className="w-14 shrink-0 font-medium">
                            {tab} {it.num}
                          </span>
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded text-xs font-semibold ${CELL[m!.level]}`}>{m!.level}</span>
                          <span className="min-w-0 flex-1 text-slate-700">{m!.justification || <i className="text-slate-400">No justification</i>}</span>
                          {m!.source === "ai" && <span className="shrink-0 rounded bg-violet-50 px-1.5 text-[11px] text-violet-700">AI</span>}
                          {p.canEdit && (
                            <button
                              className="shrink-0 text-xs text-slate-500 hover:text-brand"
                              onClick={() => setDialog({ kind: "mapping", outcome: o, mapKind: tab, num: it.num })}
                            >
                              Edit
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">No {tab} mapped.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Dialogs */}
      {dialog?.kind === "details" && <SubjectForm subject={p.subject} schemes={[p.subject.scheme]} onClose={close} />}
      {dialog?.kind === "deleteSubject" && (
        <ConfirmDialog
          title={`Delete ${p.subject.code}?`}
          text={`This permanently deletes “${p.subject.name}”, its ${p.outcomes.length} course outcomes and all their mappings.`}
          run={() => createClient().from("subjects").delete().eq("id", p.subject.id)}
          onClose={close}
          onDone={() => router.push(listHref(p.subject.scheme, p.subject.semester ?? "all"))}
        />
      )}
      {dialog?.kind === "outcome" && (
        <OutcomeDialog
          subjectId={p.subject.id}
          outcome={dialog.outcome}
          outcomes={p.outcomes}
          onClose={close}
          onSaved={saved}
        />
      )}
      {dialog?.kind === "deleteOutcome" && (
        <ConfirmDialog
          title={`Delete CO${dialog.outcome.co_no}?`}
          text="This deletes the course outcome and its WK and SDG mappings."
          run={() => createClient().from("outcomes").delete().eq("id", dialog.outcome.id)}
          onClose={close}
          onDone={saved}
        />
      )}
      {dialog?.kind === "pasteOutcomes" && (
        <PasteOutcomesDialog subjectId={p.subject.id} outcomes={p.outcomes} onClose={close} onSaved={saved} />
      )}
      {dialog?.kind === "remapAll" && (
        <ConfirmDialog
          title="Re-map with AI?"
          text={`The AI will redo the WK and SDG mappings of all ${p.outcomes.length} COs. Any changes you made to them will be replaced.`}
          action="Re-map all"
          run={async () => ({ error: null })}
          onClose={close}
          onDone={() => {
            close();
            void runAi(p.outcomes.map((o) => o.co_no));
          }}
        />
      )}
      {dialog?.kind === "prompt" && <PromptDialog subject={p.subject} outcomes={p.outcomes} onClose={close} />}
      {dialog?.kind === "pasteAi" && (
        <PasteAiDialog subjectId={p.subject.id} outcomes={p.outcomes} existing={{ WK: count("WK"), SDG: count("SDG") }} onClose={close} onSaved={saved} />
      )}
      {dialog?.kind === "mapping" && (
        <MappingDialog
          outcome={dialog.outcome}
          kind={dialog.mapKind}
          num={dialog.num}
          current={byKey.get(`${dialog.outcome.id}:${dialog.mapKind}:${dialog.num}`)}
          onClose={close}
          onSaved={saved}
        />
      )}
    </div>
  );
}
