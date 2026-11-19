// ──────────────────────────────────────────────────────────────────────
// WHAT: The AI "language" of the app, used by both the automatic route and the manual dialogs:
//   buildPrompt()  -> writes the instructions + course + COs + WK/SDG/PO/PSO definitions the AI receives.
//   parseAiTable() -> reads the AI's answer (CSV, Markdown table or pasted Excel) into rows, skipping bad lines.
// ──────────────────────────────────────────────────────────────────────

import { COUNT, KINDS, PO, SDG, WK, type Kind } from "./reference";

export type AiRow = { co_no: number; kind: Kind; num: number; level: number; justification: string };

export type PromptInput = {
  code: string;
  name: string;
  department: string;
  outcomes: { co_no: number; statement: string; k_level: string | null; title: string; topics: string }[];
  /** The programme's PSO statements from Settings (PSO1, PSO2, …). */
  psos?: string[];
};

export const CSV_HEADER = "CO,Type,No,Level,Justification";

const KIND_TITLE: Record<Kind, string> = {
  WK: "the Washington Accord knowledge profile (WK1–WK9)",
  SDG: "the UN Sustainable Development Goals (SDG1–SDG17)",
  PO: "the NBA Programme Outcomes (PO1–PO11)",
  PSO: "the Programme Specific Outcomes (PSOs)",
};

// The prompt is built in parts: task, course, COs, level scale, the definitions of each framework,
// rules, output format. Changing the wording here changes how every subject is mapped.
export function buildPrompt(s: PromptInput, kinds: Kind[] = KINDS): string {
  const psos = (s.psos ?? []).filter((t) => t.trim());
  // Without PSO statements there is nothing to map PSOs to.
  const use = KINDS.filter((k) => kinds.includes(k) && (k !== "PSO" || psos.length > 0));

  const cos = [...s.outcomes]
    .sort((a, b) => a.co_no - b.co_no)
    .map((o) => {
      const head = `CO${o.co_no}${o.k_level ? ` (${o.k_level})` : ""}: ${o.statement}`;
      const mod = [o.title, o.topics].filter(Boolean).join(" — ");
      return mod ? `${head}\n   Module: ${mod}` : head;
    })
    .join("\n");

  const list = use.map((k) => KIND_TITLE[k]);
  const parts: string[] = [];

  // 1. The task
  parts.push(
    `You are helping engineering faculty prepare NBA accreditation documents. Map each course outcome (CO) of the course below to ${
      list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0]
    }.`,
  );
  // 2. The course and its COs
  parts.push(`COURSE\nCode: ${s.code}\nName: ${s.name}${s.department ? `\nDepartment: ${s.department}` : ""}`);
  parts.push(`COURSE OUTCOMES\n${cos}`);
  // 3. What the levels mean
  parts.push(
    [
      "LEVELS",
      "3 = strong, direct contribution: the CO explicitly requires this knowledge or directly develops this outcome / advances this goal.",
      "2 = clear but partial contribution.",
      "1 = limited, supporting contribution.",
      "No row = no meaningful relationship.",
    ].join("\n"),
  );
  // 4. The definitions of everything the COs are mapped to
  if (use.includes("WK")) {
    parts.push(`WK (KNOWLEDGE PROFILE)\n${WK.map((k) => `WK${k.num} – ${k.name}: ${k.description}`).join("\n")}`);
  }
  if (use.includes("SDG")) {
    parts.push(`SDGs\n${SDG.map((g) => `SDG${g.num} – ${g.name}: ${g.description}`).join("\n")}`);
  }
  if (use.includes("PO")) {
    parts.push(
      `PROGRAMME OUTCOMES (NBA)\n${PO.map((p) => `PO${p.num} – ${p.name}: ${p.description}${p.wk ? ` (${p.wk})` : ""}`).join("\n")}`,
    );
  }
  if (use.includes("PSO")) {
    parts.push(`PROGRAMME SPECIFIC OUTCOMES\n${psos.map((t, i) => `PSO${i + 1}: ${t}`).join("\n")}`);
  }
  // 5. Rules
  parts.push(
    [
      "RULES",
      "- Judge each CO on what it actually teaches (its statement, K-level and module topics), not on the subject area in general.",
      "- Do not map everything: only include an item when you can justify it from the CO content.",
      ...(use.includes("SDG") ? ["- General engineering knowledge is not automatically SDG 9. A CO may have no SDG at all."] : []),
      ...(use.includes("PO")
        ? [
            "- POs follow the K-level: K1–K2 COs mostly support PO1 (and sometimes PO2); K3–K4 add PO2, PO3, PO5; design, experiments or analysis of data support PO3/PO4.",
            "- PO6–PO11 only when the CO explicitly involves society/sustainability, ethics, teamwork, communication, project management/finance or self-learning.",
            ...(use.includes("WK")
              ? ["- Keep PO and WK consistent: PO1–PO2 relate to WK1–WK4, PO3 to WK5, PO4 to WK8, PO5 to WK2/WK6, PO6 to WK1/WK5/WK7, PO7 to WK9, PO11 to WK8."]
              : []),
          ]
        : []),
      ...(use.includes("PSO") ? ["- Map a PSO only when the CO directly builds the skill that PSO describes."] : []),
      "- Justification: one sentence of at most 20 words, specific to the CO content. Do not repeat the level or the item's name.",
      "- Use only the CO numbers listed above.",
    ].join("\n"),
  );
  // 6. The exact answer format (read back by parseAiTable below)
  const example: Record<Kind, string> = {
    WK: `CO1,WK,2,3,"Requires deriving and solving the mathematical model of the system."`,
    SDG: `CO1,SDG,7,2,"Efficient operation reduces the energy consumed by the system."`,
    PO: `CO1,PO,1,3,"Applies engineering fundamentals to analyse the behaviour of the system."`,
    PSO: `CO1,PSO,1,2,"Builds skill in designing and testing the circuits used in the system."`,
  };
  parts.push(
    [
      "OUTPUT",
      "Return ONLY a CSV inside a single code block, with exactly this header and one row per mapping (levels 1–3 only):",
      CSV_HEADER,
      `Type is one of: ${use.join(", ")}. No is the number (e.g. 3 for ${use[0]}3).`,
      "Example rows (format only):",
      ...use.map((k) => example[k]),
    ].join("\n"),
  );
  return parts.join("\n\n");
}

// ───────────────────────── Reading the AI's answer ─────────────────────────
export type ParseResult = { rows: AiRow[]; kinds: Kind[]; warnings: string[] };

// Splits one CSV line into cells, respecting "quoted, text".
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Accepts CSV (as asked for), tab-separated text pasted from Excel/Sheets, or a Markdown table.
 *  Columns: CO, Type, No, Level, Justification. A combined "Target" column such as "SDG 7" also works. */
export function parseAiTable(text: string, validCos: number[], psoCount = 3): ParseResult {
  const warnings: string[] = [];
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("```") && !/^\|?[\s:|-]+\|?$/.test(l)); // drop fences and |---| lines

  const md = lines.some((l) => l.startsWith("|"));
  const rows = lines.map((l) => {
    if (md) return l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    return splitCsvLine(l, l.includes("\t") ? "\t" : ",");
  });

  // Find the header row (it has "CO" and "Level"); everything above it (e.g. "Sure! Here is…") is ignored.
  const hIdx = rows.findIndex((r) => r.some((c) => /^co$/i.test(c)) && r.some((c) => /^level$/i.test(c)));
  if (hIdx < 0) {
    return { rows: [], kinds: [], warnings: [`Couldn't find the header row. It should be: ${CSV_HEADER}`] };
  }
  const h = rows[hIdx].map((c) => c.toLowerCase());
  const col = (...names: string[]) => h.findIndex((c) => names.includes(c));
  const iCo = col("co");
  const iType = col("type", "kind", "framework");
  const iNo = col("no", "num", "number", "no.");
  const iTarget = col("target", "mapping to", "wk/sdg");
  const iLevel = col("level", "mapping");
  const iJust = col("justification", "reason");

  // Check every row: real CO, WK1–9 / SDG1–17, level 1–3. Problems become warnings instead of errors.
  const valid = new Set(validCos);
  const byKey = new Map<string, AiRow>();

  rows.slice(hIdx + 1).forEach((r, i) => {
    const line = hIdx + i + 2;
    if (r.length < 3) return; // a sentence after the table, not a row
    const co = parseInt((r[iCo] ?? "").replace(/\D/g, ""), 10);
    let kind = ((iType >= 0 ? r[iType] : "") ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    let num = iNo >= 0 ? parseInt((r[iNo] ?? "").replace(/\D/g, ""), 10) : NaN;
    if ((!kind || Number.isNaN(num)) && iTarget >= 0) {
      const m = (r[iTarget] ?? "").toUpperCase().match(/(WK|SDG|PSO|PO)\s*-?\s*(\d+)/);
      if (m) {
        kind = m[1];
        num = parseInt(m[2], 10);
      }
    }
    const levelText = (r[iLevel] ?? "").trim();
    const level = /^[-–—]?$/.test(levelText) ? 0 : parseInt(levelText, 10);
    const justification = (iJust >= 0 ? r[iJust] : "") ?? "";

    if (Number.isNaN(co)) return warnings.push(`Line ${line}: no CO number.`);
    if (!valid.has(co)) return warnings.push(`Line ${line}: CO${co} doesn't exist in this subject — skipped.`);
    if (!KINDS.includes(kind as Kind)) return warnings.push(`Line ${line}: type must be WK, SDG, PO or PSO.`);
    const max = kind === "PSO" ? Math.min(psoCount, COUNT.PSO) : COUNT[kind as Kind];
    if (!(num >= 1 && num <= max)) return warnings.push(`Line ${line}: ${kind}${num} is not valid.`);
    if (!(level >= 0 && level <= 3)) return warnings.push(`Line ${line}: level must be 1, 2 or 3.`);
    if (level === 0) return;
    const key = `${co}:${kind}:${num}`;
    if (byKey.has(key)) warnings.push(`Line ${line}: CO${co} ${kind}${num} appears twice; the later row is used.`);
    byKey.set(key, { co_no: co, kind: kind as Kind, num, level, justification });
  });

  const out = Array.from(byKey.values()).sort(
    (a, b) => a.co_no - b.co_no || a.kind.localeCompare(b.kind) || a.num - b.num,
  );
  const kinds = KINDS.filter((k) => out.some((r) => r.kind === k));
  return { rows: out, kinds, warnings };
}
