"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: The Subjects page UI (browser): Scheme + Semester dropdowns, search, the subject cards,
//       and the buttons "Import from Excel" and "+ New subject".
// ALSO: SubjectForm (create/edit a subject) and listHref() (a link back to the list with the same filters),
//       which the subject page reuses.
// ──────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ImportDialog from "@/components/ImportDialog";
import { ErrorNote, Modal } from "@/components/Modal";
import { SEMESTERS } from "@/lib/reference";
import { createClient } from "@/lib/supabase/client";
import type { Subject } from "@/lib/types";

export type SubjectRow = Subject & { co_count: number; wk_count: number; sdg_count: number };

const LAST_SCHEME = "co-mapping:scheme";

/** Link back to the subject list with the same scheme and semester selected. */
export function listHref(scheme: string, semester: number | null | "all") {
  const q = new URLSearchParams();
  if (scheme) q.set("scheme", scheme);
  if (semester !== null) q.set("sem", String(semester));
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export default function SubjectList({
  rows,
  canEdit,
  initialScheme,
  initialSem,
}: {
  rows: SubjectRow[];
  canEdit: boolean;
  initialScheme: string | null;
  initialSem: string | null;
}) {
  // ── Filters ──
  // Schemes = every scheme used by a subject + any added with "+ New scheme…" (newest first).
  const [extraSchemes, setExtraSchemes] = useState<string[]>([]);
  const schemes = useMemo(
    () => Array.from(new Set([...rows.map((r) => r.scheme), ...extraSchemes])).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    [rows, extraSchemes],
  );
  // Selected scheme / semester / search text, and which pop-up is open.
  const [scheme, setScheme] = useState<string>(initialScheme ?? schemes[0] ?? "");
  const [sem, setSem] = useState<number | "all">(initialSem && initialSem !== "all" ? Number(initialSem) : "all");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<"new" | "import" | "scheme" | null>(null);

  // Remember the last scheme, and keep the choice in the address so "back" returns here.
  // On first load: if the address has no scheme, reuse the last scheme picked on this computer.
  useEffect(() => {
    if (!initialScheme) {
      try {
        const last = localStorage.getItem(LAST_SCHEME);
        if (last && schemes.includes(last)) setScheme(last);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Whenever the filters change: remember the scheme, and put both filters in the address bar
  // (so the browser's Back button and the subject page's "← Scheme" link come back to the same view).
  useEffect(() => {
    try {
      if (scheme) localStorage.setItem(LAST_SCHEME, scheme);
    } catch {}
    window.history.replaceState(null, "", listHref(scheme, sem));
  }, [scheme, sem]);

  // Apply the filters, then group by semester for the "All semesters" view.
  const inScheme = rows.filter((r) => r.scheme === scheme);
  const shown = inScheme
    .filter((r) => sem === "all" || r.semester === sem)
    .filter((r) => `${r.code} ${r.name} ${r.department}`.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = SEMESTERS.concat([0])
    .map((s) => ({ sem: s, items: shown.filter((r) => (r.semester ?? 0) === s) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Subjects</h1>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn" onClick={() => setDialog("import")}>
              Import from Excel
            </button>
            <button className="btn btn-primary" onClick={() => setDialog("new")} disabled={!scheme}>
              + New subject
            </button>
          </div>
        )}
      </div>

      {/* Scheme and semester */}
      <div className="card grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <label className="label">Scheme</label>
          <select
            className="input"
            value={scheme}
            onChange={(e) => (e.target.value === "__new" ? setDialog("scheme") : setScheme(e.target.value))}
          >
            {!schemes.length && <option value="">No schemes yet</option>}
            {schemes.map((s) => (
              <option key={s} value={s}>
                {s || "(no scheme)"}
              </option>
            ))}
            {canEdit && <option value="__new">+ New scheme…</option>}
          </select>
        </div>
        <div>
          <label className="label">Semester</label>
          <select className="input" value={sem} onChange={(e) => setSem(e.target.value === "all" ? "all" : Number(e.target.value))}>
            <option value="all">All semesters</option>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                Semester {s} ({inScheme.filter((r) => r.semester === s).length})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Search</label>
          <input className="input" type="search" placeholder="Code or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.sem}>
          {sem === "all" && <h2 className="mb-2 text-sm font-semibold text-slate-500">{g.sem ? `Semester ${g.sem}` : "No semester"}</h2>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((r) => (
              <li key={r.id}>
                <Link href={`/subjects/${r.id}`} className="card block h-full transition hover:border-slate-400">
                  <div className="text-xs text-slate-500">
                    {r.code}
                    {r.semester ? ` · S${r.semester}` : ""}
                  </div>
                  <div className="mt-0.5 font-semibold leading-snug">{r.name}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    <Chip ok={r.co_count > 0}>{r.co_count} COs</Chip>
                    <Chip ok={r.wk_count > 0 && r.sdg_count > 0}>{r.wk_count + r.sdg_count > 0 ? "Mapped" : "Not mapped"}</Chip>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!shown.length && (
        <div className="card text-center text-slate-600">
          <p className="font-medium">
            {!scheme ? "No subjects yet." : q ? "No subjects match your search." : `No subjects in ${scheme}${sem === "all" ? "" : `, semester ${sem}`}.`}
          </p>
          {canEdit && !q && <p className="mt-1 text-sm">Use “Import from Excel” to add many subjects with their COs, or “New subject”.</p>}
        </div>
      )}

      {dialog === "new" && <SubjectForm defaults={{ scheme, semester: sem === "all" ? null : sem }} schemes={schemes} onClose={() => setDialog(null)} />}
      {dialog === "import" && (
        <ImportDialog
          existing={rows}
          schemes={schemes}
          defaultScheme={scheme}
          defaultSemester={sem === "all" ? null : sem}
          onClose={() => setDialog(null)}
          onImported={(s) => {
            setDialog(null);
            if (s) setScheme(s);
          }}
        />
      )}
      {dialog === "scheme" && (
        <NewSchemeDialog
          onClose={() => setDialog(null)}
          onCreate={(name) => {
            setExtraSchemes((x) => [...x, name]);
            setScheme(name);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 ${ok ? "bg-green-50 text-green-800" : "bg-stone-100 text-slate-500"}`}>{children}</span>;
}

function NewSchemeDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Modal title="New scheme" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
        className="space-y-3"
      >
        <div>
          <label className="label">Scheme name</label>
          <input className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="2024 Scheme" />
        </div>
        <p className="text-xs text-slate-500">The scheme is saved when you add its first subject (or import subjects into it).</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Use this scheme</button>
        </div>
      </form>
    </Modal>
  );
}

/** Create a subject, or edit one (pass `subject`). */
export function SubjectForm({
  subject,
  defaults,
  schemes,
  onClose,
}: {
  subject?: Subject;
  defaults?: { scheme: string; semester: number | null };
  schemes: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [scheme, setScheme] = useState(subject?.scheme ?? defaults?.scheme ?? "");
  const [semester, setSemester] = useState<string>(String(subject?.semester ?? defaults?.semester ?? ""));
  const [code, setCode] = useState(subject?.code ?? "");
  const [name, setName] = useState(subject?.name ?? "");
  const [department, setDepartment] = useState(subject?.department ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const values = {
      scheme: scheme.trim(),
      semester: semester ? Number(semester) : null,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      department: department.trim(),
    };
    const res = subject
      ? await supabase.from("subjects").update(values).eq("id", subject.id).select("id").single()
      : await supabase.from("subjects").insert(values).select("id").single();
    setBusy(false);
    if (res.error || !res.data) {
      return setError(res.error?.code === "23505" ? "This scheme already has a subject with that code." : res.error?.message ?? "Could not save.");
    }
    onClose();
    if (subject) router.refresh();
    else router.push(`/subjects/${res.data.id}`);
  }

  return (
    <Modal title={subject ? "Edit subject" : "New subject"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Scheme</label>
            <input className="input" required list="schemes" value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="2019 Scheme" />
            <datalist id="schemes">
              {schemes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Semester</label>
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
        <div>
          <label className="label">Course code</label>
          <input className="input" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="EET413" />
        </div>
        <div>
          <label className="label">Course name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Electric Drives" />
        </div>
        <div>
          <label className="label">Department (printed in the PDF header)</label>
          <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department of Electrical Engineering" />
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
