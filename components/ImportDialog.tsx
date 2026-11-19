"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: The "Import from Excel" dialog (browser).
// FLOW: choose file -> lib/excel.ts reads it IN THE BROWSER -> preview table (new / updates) ->
//       "Import" sends the subjects to the database function import_subjects, 20 at a time.
// ──────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNote, Modal } from "@/components/Modal";
import type { SubjectRow } from "@/components/SubjectList";
import type { ImportResult } from "@/lib/excel";
import { SEMESTERS } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";

const CHUNK = 20; // subjects per request

/** Import subjects and their COs from an Excel/CSV file, with a preview first. */
export default function ImportDialog({
  existing,
  schemes,
  defaultScheme,
  defaultSemester,
  onClose,
  onImported,
}: {
  existing: SubjectRow[];
  schemes: string[];
  defaultScheme: string;
  defaultSemester: number | null;
  onClose: () => void;
  onImported: (scheme: string | null) => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [scheme, setScheme] = useState(defaultScheme);
  const [semester, setSemester] = useState<string>(defaultSemester ? String(defaultSemester) : "");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  // Re-read the file whenever it or the defaults change.
  // Read the file again whenever it, the default scheme or the default semester changes,
  // so the preview is always up to date. Nothing is saved yet.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const { parseSubjectsFile } = await import("@/lib/excel");
        const r = await parseSubjectsFile(file, { scheme: scheme.trim(), semester: semester ? Number(semester) : null });
        if (!cancelled) setResult(r);
      } catch (e) {
        if (!cancelled) {
          setResult(null);
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, scheme, semester]);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const { templateWorkbook } = await import("@/lib/excel");
    XLSX.writeFile(templateWorkbook(), "subjects_template.xlsx");
  }

  // "new" or "updates" label in the preview: does this scheme already have this course code?
  const isNew = (code: string, s: string) => !existing.some((e) => e.code === code && e.scheme === s);
  const missingScheme = result?.subjects.some((s) => !s.scheme);

  // "Import" button: send the subjects to the database function import_subjects, 20 at a time.
  async function run() {
    if (!result) return;
    setError(null);
    const supabase = createClient();
    try {
      for (let i = 0; i < result.subjects.length; i += CHUNK) {
        setProgress(i / result.subjects.length);
        const { error } = await supabase.rpc("import_subjects", { p_subjects: result.subjects.slice(i, i + CHUNK) });
        if (error) throw new Error(error.message);
      }
      router.refresh();
      onImported(result.subjects[0]?.scheme ?? null);
    } catch (e) {
      setError(`Import stopped: ${(e as Error).message}`);
      router.refresh();
    } finally {
      setProgress(null);
    }
  }

  return (
    <Modal title="Import subjects from Excel" onClose={onClose} wide>
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          One row per CO, with columns <b>Course Code</b>, <b>Course Name</b>, <b>CO</b>, <b>CO Statement</b> (optional: Scheme,
          Semester, Department, K Level, Module Title, Topics). A row per subject with <b>CO1, CO2, …</b> columns also works.{" "}
          <button className="text-brand underline" onClick={downloadTemplate}>
            Download a template
          </button>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Scheme (used when the file has no Scheme column)</label>
            <input className="input" list="import-schemes" value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="2019 Scheme" />
            <datalist id="import-schemes">
              {schemes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Semester (used when the file has no Semester column)</label>
            <select className="input" value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">–</option>
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-stone-300 px-4 py-6 text-center hover:border-brand">
          <span className="font-medium text-slate-800">{file ? file.name : "Choose an .xlsx or .csv file"}</span>
          <span className="mt-1 text-xs">Nothing is saved until you press Import.</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              setResult(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
      </div>

      {result && (
        <div className="mt-4">
          <p className="text-sm">
            Sheet <b>{result.sheet}</b>: <b>{result.subjects.length}</b> subjects, <b>{result.subjects.reduce((a, s) => a + s.outcomes.length, 0)}</b> COs.
          </p>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-stone-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Scheme</th>
                  <th className="px-2 py-1.5 font-medium">Sem</th>
                  <th className="px-2 py-1.5 font-medium">Code</th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium">COs</th>
                  <th className="px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.subjects.map((s) => (
                  <tr key={`${s.scheme}|${s.code}`}>
                    <td className="px-2 py-1.5">{s.scheme || <span className="text-red-600">missing</span>}</td>
                    <td className="px-2 py-1.5">{s.semester ?? "–"}</td>
                    <td className="px-2 py-1.5 font-medium">{s.code}</td>
                    <td className="px-2 py-1.5">{s.name}</td>
                    <td className="px-2 py-1.5">{s.outcomes.length}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{isNew(s.code, s.scheme) ? "new" : "updates"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            For subjects that already exist, the COs are replaced by the file’s COs. Existing WK/SDG mappings are kept for CO numbers
            that are still there; use <b>Map with AI</b> again if a CO’s text changed.
          </p>
          {result.warnings.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-amber-700">{result.warnings.length} warnings</summary>
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
        <button className="btn" onClick={onClose} disabled={progress !== null}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={run} disabled={!result?.subjects.length || !!missingScheme || progress !== null}>
          {progress !== null ? `Importing… ${Math.round(progress * 100)}%` : `Import ${result?.subjects.length ?? ""} subjects`}
        </button>
      </div>
    </Modal>
  );
}
