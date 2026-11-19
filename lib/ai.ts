// ──────────────────────────────────────────────────────────────────────
// WHAT: The AI "language" of the app, used by both the automatic route and the manual dialogs:
//   buildPrompt()  -> writes the instructions + course + COs + WK/SDG definitions the AI receives.
//   parseAiTable() -> reads the AI's answer (CSV, Markdown table or pasted Excel) into rows, skipping bad lines.
// ──────────────────────────────────────────────────────────────────────

import { COUNT, SDG, WK, type Kind } from "./reference";

export type AiRow = { co_no: number; kind: Kind; num: number; level: number; justification: string };

export type PromptInput = {
  code: string;
  name: string;
  department: string;
  outcomes: { co_no: number; statement: string; k_level: string | null; title: string; topics: string }[];
};

export const CSV_HEADER = "CO,Type,No,Level,Justification";

// The prompt is built in parts: task, course, COs, level scale, WK and SDG definitions, rules, output format.
// Changing the wording here changes how every subject is mapped.
export function buildPrompt(s: PromptInput, kinds: Kind[] = ["WK", "SDG"]): string {
  const cos = [...s.outcomes]
    .sort((a, b) => a.co_no - b.co_no)
    .map((o) => {
      const head = `CO${o.co_no}${o.k_level ? ` (${o.k_level})` : ""}: ${o.statement}`;
      const mod = [o.title, o.topics].filter(Boolean).join(" — ");
      return mod ? `${head}\n   Module: ${mod}` : head;
    })
    .join("\n");

  const parts: string[] = [];
  parts.push(
    `You are helping engineering faculty prepare NBA accreditation documents. Map each course outcome (CO) of the course below to ${
      kinds.length === 2
        ? "the Washington Accord knowledge profile (WK1–WK9) and the UN Sustainable Development Goals (SDG1–SDG17)"
        : kinds[0] === "WK"
          ? "the Washington Accord knowledge profile (WK1–WK9)"
          : "the UN Sustainable Development Goals (SDG1–SDG17)"
    }.`,
  );
  parts.push(`COURSE\nCode: ${s.code}\nName: ${s.name}${s.department ? `\nDepartment: ${s.department}` : ""}`);
  parts.push(`COURSE OUTCOMES\n${cos}`);
  parts.push(
    [
      "LEVELS",
      "3 = strong, direct contribution: the CO explicitly requires this knowledge or directly advances this goal.",
      "2 = clear but partial contribution.",
      "1 = limited, supporting contribution.",
      "No row = no meaningful relationship.",
    ].join("\n"),
  );
  if (kinds.includes("WK")) {
    parts.push(`WK (KNOWLEDGE PROFILE)\n${WK.map((k) => `WK${k.num} – ${k.name}: ${k.description}`).join("\n")}`);
  }
  if (kinds.includes("SDG")) {
    parts.push(`SDGs\n${SDG.map((g) => `SDG${g.num} – ${g.name}: ${g.description}`).join("\n")}`);
  }
  parts.push(
    [
      "RULES",
      "- Judge each CO on what it actually teaches (its statement and module topics), not on the subject area in general.",
      "- Do not map everything: only include a WK or SDG when you can justify it from the CO content.",
      ...(kinds.includes("SDG")
        ? ["- General engineering knowledge is not automatically SDG 9. A CO may have no SDG at all."]
        : []),
      "- Justification: one sentence of at most 20 words, specific to the CO content. Do not repeat the level or the goal's name.",
      "- Use only the CO numbers listed above.",
    ].join("\n"),
  );
  const ex: string[] = [];
  if (kinds.includes("WK")) ex.push(`CO1,WK,2,3,"Fundamental torque equations, equivalent parameters and stability require mathematical modelling."`);
  if (kinds.includes("SDG")) ex.push(`CO1,SDG,7,3,"Energy efficiency and efficient operation of electrical drives."`);
  parts.push(
    [
      "OUTPUT",
      "Return ONLY a CSV inside a single code block, with exactly this header and one row per mapping (levels 1–3 only):",
      CSV_HEADER,
      "Example rows (from a different course):",
      ...ex,
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
export function parseAiTable(text: string, validCos: number[]): ParseResult {
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
      const m = (r[iTarget] ?? "").toUpperCase().match(/(WK|SDG)\s*-?\s*(\d+)/);
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
    if (kind !== "WK" && kind !== "SDG") return warnings.push(`Line ${line}: type must be WK or SDG.`);
    if (!(num >= 1 && num <= COUNT[kind as Kind])) return warnings.push(`Line ${line}: ${kind}${num} is not valid.`);
    if (!(level >= 0 && level <= 3)) return warnings.push(`Line ${line}: level must be 1, 2 or 3.`);
    if (level === 0) return;
    const key = `${co}:${kind}:${num}`;
    if (byKey.has(key)) warnings.push(`Line ${line}: CO${co} ${kind}${num} appears twice; the later row is used.`);
    byKey.set(key, { co_no: co, kind: kind as Kind, num, level, justification });
  });

  const out = Array.from(byKey.values()).sort(
    (a, b) => a.co_no - b.co_no || a.kind.localeCompare(b.kind) || a.num - b.num,
  );
  const kinds = (["WK", "SDG"] as Kind[]).filter((k) => out.some((r) => r.kind === k));
  return { rows: out, kinds, warnings };
}
