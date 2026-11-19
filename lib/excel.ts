// ──────────────────────────────────────────────────────────────────────
// WHAT: Reads subjects + COs from an Excel/CSV file for "Import from Excel" (runs in the browser).
// ──────────────────────────────────────────────────────────────────────

// Reads subjects and their course outcomes from an Excel/CSV file (in the browser).
//
// Layout A (one row per CO):
//   Scheme | Semester | Course Code | Course Name | Department | CO | CO Statement | K Level | Module Title | Topics
// Layout B (one row per subject):
//   Scheme | Semester | Course Code | Course Name | CO1 | CO2 | CO3 | …
// Only Course Code, Course Name and the CO text are required. Missing Scheme/Semester come from
// the values chosen in the import dialog. Column names are matched loosely (e.g. course_id, co_text).
import * as XLSX from "xlsx";

export type ImportOutcome = { co_no: number; statement: string; k_level: string | null; title: string; topics: string };
export type ImportSubject = {
  scheme: string;
  semester: number | null;
  code: string;
  name: string;
  department: string;
  outcomes: ImportOutcome[];
};
export type ImportResult = { sheet: string; subjects: ImportSubject[]; warnings: string[] };

// Accepted column names for each field (lower-case). Add more here if your sheets use other headings.
const A = {
  scheme: ["scheme", "regulation", "curriculum"],
  semester: ["semester", "sem", "semester no", "sem no"],
  code: ["course code", "course_code", "code", "course_id", "course id", "subject code", "subject_code", "course no"],
  name: ["course name", "course_name", "subject name", "subject", "course title", "course", "title of the course"],
  department: ["department", "dept", "branch"],
  co: ["co", "co no", "co_no", "co_id", "co id", "co number", "co no."],
  statement: ["co statement", "statement", "co_text", "co text", "course outcome", "course outcomes", "outcome", "co description", "description"],
  k: ["k level", "k_level", "k-level", "knowledge level", "bloom level", "bloom's level", "bl", "level"],
  title: ["module title", "module", "module name", "co title"],
  topics: ["topics", "module topics", "module content", "content", "syllabus"],
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

// "5", "S5", "Sem 5", "Semester 5" or "V" -> 5
export function parseSemester(v: string): number | null {
  const s = norm(v).toUpperCase().replace(/^(SEMESTER|SEM|S)\s*/, "");
  if (!s) return null;
  if (ROMAN[s]) return ROMAN[s];
  const n = parseInt(s, 10);
  return n >= 1 && n <= 10 ? n : null;
}

function parseK(v: string): string | null {
  const m = norm(v).toUpperCase().match(/^K?\s*([1-6])$/);
  return m ? `K${m[1]}` : null;
}

function headerIndex(head: string[], names: string[]) {
  return head.findIndex((h) => names.includes(h));
}

type Layout = { sheet: string; head: string[]; rows: string[][]; wideCols: { idx: number; co: number }[] };

/** Picks the first sheet that has a course code, a course name and CO text (long or wide layout). */
function findSheet(wb: XLSX.WorkBook): Layout | null {
  for (const sheet of wb.SheetNames) {
    const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "", raw: false });
    // The header may not be on the first row (titles above the table): look in the first 10 rows.
    for (let h = 0; h < Math.min(10, all.length); h++) {
      const head = (all[h] ?? []).map((c) => norm(c).toLowerCase());
      const has = (n: string[]) => headerIndex(head, n) >= 0;
      const wideCols = head
        .map((c, idx) => ({ idx, m: c.match(/^co\s*-?\s*(\d{1,2})$/) }))
        .filter((x) => x.m)
        .map((x) => ({ idx: x.idx, co: Number(x.m![1]) }));
      const long = has(A.statement) && has(A.co);
      if (has(A.code) && has(A.name) && (long || wideCols.length)) {
        return {
          sheet,
          head,
          rows: all.slice(h + 1).map((r) => (r ?? []).map((c) => norm(c))),
          wideCols: long ? [] : wideCols,
        };
      }
    }
  }
  return null;
}

// Main entry: file -> list of subjects, each with its COs, plus warnings for rows that couldn't be used.
export async function parseSubjectsFile(file: File, defaults: { scheme: string; semester: number | null }): Promise<ImportResult> {
  const wb = XLSX.read(await file.arrayBuffer());
  const layout = findSheet(wb);
  if (!layout) {
    throw new Error(
      "Couldn't find the columns. The sheet needs Course Code, Course Name and either a CO + CO Statement column, or CO1, CO2, … columns.",
    );
  }
  const { head, rows, wideCols, sheet } = layout;
  const col = (n: string[]) => headerIndex(head, n);
  const i = {
    scheme: col(A.scheme),
    semester: col(A.semester),
    code: col(A.code),
    name: col(A.name),
    department: col(A.department),
    co: col(A.co),
    statement: col(A.statement),
    k: col(A.k),
    title: col(A.title),
    topics: col(A.topics),
  };
  const cell = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? "") : "");

  const warnings: string[] = [];
  const subjects = new Map<string, ImportSubject>();

  rows.forEach((r, n) => {
    const line = n + 2;
    const code = cell(r, i.code).toUpperCase();
    if (!code) return;
    const scheme = cell(r, i.scheme) || defaults.scheme;
    const semText = cell(r, i.semester);
    const semester = semText ? parseSemester(semText) : defaults.semester;
    if (semText && semester === null) warnings.push(`Row ${line}: semester “${semText}” not understood.`);
    const key = `${scheme}|${code}`;
    if (!subjects.has(key)) {
      subjects.set(key, {
        scheme,
        semester,
        code,
        name: cell(r, i.name) || code,
        department: cell(r, i.department),
        outcomes: [],
      });
    }
    const s = subjects.get(key)!;

    const add = (co: number, statement: string, k: string | null, title = "", topics = "") => {
      if (!statement) return;
      if (!(co >= 1 && co <= 20)) return warnings.push(`Row ${line}: ${code} has an invalid CO number.`);
      if (s.outcomes.some((o) => o.co_no === co)) return warnings.push(`Row ${line}: ${code} CO${co} appears twice; the first is kept.`);
      s.outcomes.push({ co_no: co, statement, k_level: k, title, topics });
    };

    // Layout B: CO1, CO2, … columns on one row.  Layout A (else): one row per CO.
    if (wideCols.length) {
      for (const w of wideCols) {
        // A cell may end with the K level, e.g. "Describe … (K2)"
        let text = r[w.idx] ?? "";
        let k: string | null = null;
        const km = text.match(/[\s,;(\[–-]*\(?\b(K[1-6])\b\)?\]?\s*$/i);
        if (km) {
          k = km[1].toUpperCase();
          text = text.slice(0, km.index).trim();
        }
        add(w.co, text, k);
      }
    } else {
      const coText = cell(r, i.co);
      const co = coText ? parseInt(coText.replace(/\D/g, ""), 10) : s.outcomes.length + 1;
      add(co, cell(r, i.statement), parseK(cell(r, i.k)), cell(r, i.title), cell(r, i.topics));
    }
  });

  const list = Array.from(subjects.values());
  for (const s of list) {
    s.outcomes.sort((a, b) => a.co_no - b.co_no);
    if (!s.outcomes.length) warnings.push(`${s.code}: no COs found; it will be created without COs.`);
    if (!s.scheme) warnings.push(`${s.code}: no scheme; choose one above.`);
  }
  return { sheet, subjects: list, warnings };
}

/** A small example file people can fill in. */
export function templateWorkbook(): XLSX.WorkBook {
  const rows = [
    ["Scheme", "Semester", "Course Code", "Course Name", "Department", "CO", "CO Statement", "K Level", "Module Title", "Topics"],
    ["2019 Scheme", 7, "EET413", "Electric Drives", "Department of Electrical Engineering", "CO1", "Describe the transient and steady-state aspects of electric drives", "K2", "Fundamentals and dynamics of drives", "Dynamics of motor-load systems - fundamental torque equations - steady-state stability"],
    ["2019 Scheme", 7, "EET413", "Electric Drives", "Department of Electrical Engineering", "CO2", "Apply the appropriate configuration of controlled rectifiers for the speed control of DC motors", "K3", "Rectifier-controlled DC drives", "Controlled rectifiers - continuous/discontinuous conduction - critical speed"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [14, 9, 12, 24, 30, 6, 60, 8, 30, 50].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Subjects");
  return wb;
}
