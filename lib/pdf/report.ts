// ──────────────────────────────────────────────────────────────────────
// WHAT: Draws the CO–WK–SDG PDF for one subject (runs in the browser, uses the pdf-lib library).
// LAYOUT (same order as the template): title block -> course outcomes table -> one WK table per CO ->
//       CO–WK matrix + WK legend -> CO–SDG table -> SDG legend -> CO×SDG matrix,
//       then an extra last page: the CO–PO–PSO matrix (with column averages) + PO/PSO legend.
// STRUCTURE: Doc (pages, fonts, text wrapping) -> drawTable (bordered tables that continue on the next
//       page) -> buildReport (puts the sections together).
// ──────────────────────────────────────────────────────────────────────

// Builds the CO–WK–SDG mapping PDF for one subject, in the layout of the
// EET413 template: A4 landscape, Times, bordered tables.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { PO, SDG, WK, type Kind } from "../reference";

export type ReportOutcome = { co_no: number; statement: string; k_level: string | null; title: string; topics: string };
export type ReportMapping = { co_no: number; kind: Kind; num: number; level: number; justification: string };
export type ReportData = {
  college: string;
  department: string;
  code: string;
  name: string;
  outcomes: ReportOutcome[];
  mappings: ReportMapping[];
  /** The programme's PSO statements (PSO1, PSO2, …) for the CO–PO–PSO page. */
  psos: string[];
};

// ───────────────────────── Page and style constants ─────────────────────────
const PAGE: [number, number] = [841.89, 595.28]; // A4 landscape, in points
const M = { left: 55, right: 55, top: 42, bottom: 40 };
const W = PAGE[0] - M.left - M.right;
const PAD_X = 3;
const PAD_Y = 2.2;

const BLACK = rgb(0, 0, 0);
const RED = rgb(0.75, 0, 0); // course outcomes table
const CYAN = rgb(0, 0.69, 0.94); // CO–WK matrix
const BLUE = rgb(0.18, 0.46, 0.71); // CO–SDG matrix
const BLUE_FILL = rgb(0.71, 0.78, 0.91);
const BLUE_LIGHT = rgb(0.87, 0.92, 0.97);

// ───────────────────────── Text helpers ─────────────────────────
type Seg = { text: string; bold?: boolean };
type Word = { text: string; bold: boolean; w: number; space: number; br?: boolean };
type Line = { words: Word[]; w: number };

// The built-in Times font can't print every Unicode character (e.g. Greek).
const REPLACE: Record<string, string> = {
  "μ": "u", "µ": "u", "Ω": "Ohm", "ω": "w", "π": "pi", "θ": "theta", "α": "alpha", "β": "beta", "γ": "gamma",
  "δ": "delta", "Δ": "Delta", "λ": "lambda", "σ": "sigma", "Σ": "Sigma", "φ": "phi", "η": "eta", "τ": "tau",
  "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "→": "->", "←": "<-", "⇒": "=>", "√": "sqrt", "∞": "inf",
  "‐": "-", "‑": "-", "‒": "-", "−": "-", " ": " ", "\t": " ",
};

class Doc {
  pdf: PDFDocument;
  page!: PDFPage;
  y = 0;
  font!: PDFFont;
  bold!: PDFFont;
  private ok = new Map<string, string>();

  constructor(pdf: PDFDocument) {
    this.pdf = pdf;
  }

  async init() {
    this.font = await this.pdf.embedFont(StandardFonts.TimesRoman);
    this.bold = await this.pdf.embedFont(StandardFonts.TimesRomanBold);
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage(PAGE);
    this.y = PAGE[1] - M.top;
  }

  get avail() {
    return this.y - M.bottom;
  }

  /** Replaces characters the font cannot draw. */
  clean(s: string): string {
    let out = "";
    for (const ch of s ?? "") {
      if (ch === "\n") {
        out += ch;
        continue;
      }
      let r = this.ok.get(ch);
      if (r === undefined) {
        r = REPLACE[ch] ?? ch;
        try {
          this.font.widthOfTextAtSize(r, 10);
          this.bold.widthOfTextAtSize(r, 10);
        } catch {
          r = "?";
        }
        this.ok.set(ch, r);
      }
      out += r;
    }
    return out;
  }

  width(text: string, bold: boolean, size: number) {
    return (bold ? this.bold : this.font).widthOfTextAtSize(text, size);
  }

  /** Word-wraps rich text (mixed bold/regular) to a width. "\n" forces a new line. */
  wrap(segs: Seg[], maxW: number, size: number): Line[] {
    const words: Word[] = [];
    for (const seg of segs) {
      const bold = !!seg.bold;
      const parts = this.clean(seg.text).split(/(\n| +)/);
      for (const p of parts) {
        if (p === "") continue;
        if (p === "\n") {
          words.push({ text: "", bold, w: 0, space: 0, br: true });
        } else if (/^ +$/.test(p)) {
          if (words.length) words[words.length - 1].space += this.width(" ", bold, size);
        } else {
          words.push({ text: p, bold, w: this.width(p, bold, size), space: 0 });
        }
      }
    }
    const lines: Line[] = [];
    let cur: Line = { words: [], w: 0 };
    const push = () => {
      lines.push(cur);
      cur = { words: [], w: 0 };
    };
    for (const wd of words) {
      if (wd.br) {
        push();
        continue;
      }
      // A single word wider than the cell is cut into pieces.
      if (wd.w > maxW) {
        let rest = wd.text;
        while (rest) {
          let n = rest.length;
          while (n > 1 && this.width(rest.slice(0, n), wd.bold, size) > maxW) n--;
          const piece = rest.slice(0, n);
          rest = rest.slice(n);
          const pw = this.width(piece, wd.bold, size);
          if (cur.words.length && cur.w + pw > maxW) push();
          cur.words.push({ text: piece, bold: wd.bold, w: pw, space: rest ? 0 : wd.space });
          cur.w += pw + (rest ? 0 : wd.space);
        }
        continue;
      }
      const lastSpace = cur.words.length ? cur.words[cur.words.length - 1].space : 0;
      if (cur.words.length && cur.w + wd.w > maxW + 0.01) {
        cur.w -= lastSpace;
        push();
      }
      cur.words.push({ ...wd });
      cur.w += wd.w + wd.space;
    }
    if (cur.words.length || !lines.length) push();
    for (const l of lines) if (l.words.length) l.w -= l.words[l.words.length - 1].space;
    return lines;
  }

  drawLines(lines: Line[], x: number, yTop: number, w: number, size: number, align: "left" | "center") {
    const lh = size * 1.18;
    lines.forEach((line, i) => {
      let cx = align === "center" ? x + (w - line.w) / 2 : x;
      const baseline = yTop - size * 0.86 - i * lh;
      for (const wd of line.words) {
        if (wd.text) this.page.drawText(wd.text, { x: cx, y: baseline, size, font: wd.bold ? this.bold : this.font, color: BLACK });
        cx += wd.w + wd.space;
      }
    });
    return lines.length * lh;
  }

  centeredText(text: string, size: number, bold: boolean) {
    const lines = this.wrap([{ text, bold }], W, size);
    this.drawLines(lines, M.left, this.y, W, size, "center");
    this.y -= lines.length * size * 1.18;
  }
}

// ───────────────────────── Table engine ─────────────────────────
type Cell = {
  text?: string;
  rich?: Seg[];
  colSpan?: number;
  align?: "left" | "center";
  bold?: boolean;
  size?: number;
  fill?: RGB;
  valign?: "top" | "middle";
};
/** A group = rows that share "lead" cells spanning all of them (like the CO column). */
type Group = { lead?: Cell[]; rows: Cell[][] };
type Table = {
  x?: number;
  widths: number[];
  border: RGB;
  size: number;
  header?: Group[];
  groups: Group[];
  repeatHeader?: boolean;
};

type Placed = { cell: Cell; x: number; w: number; lines: Line[]; size: number };

function layoutRow(doc: Doc, t: Table, cells: Cell[], startCol: number, x0: number) {
  let col = startCol;
  let x = x0 + t.widths.slice(0, startCol).reduce((a, b) => a + b, 0);
  let h = 0;
  const placed: Placed[] = [];
  for (const cell of cells) {
    const span = cell.colSpan ?? 1;
    const w = t.widths.slice(col, col + span).reduce((a, b) => a + b, 0);
    const size = cell.size ?? t.size;
    const segs = cell.rich ?? [{ text: cell.text ?? "", bold: cell.bold }];
    const lines = doc.wrap(segs, w - 2 * PAD_X, size);
    h = Math.max(h, lines.length * size * 1.18 + 2 * PAD_Y);
    placed.push({ cell, x, w, lines, size });
    x += w;
    col += span;
  }
  return { placed, h };
}

function drawCellBox(doc: Doc, p: { x: number; w: number; cell: Cell }, yTop: number, h: number, border: RGB) {
  doc.page.drawRectangle({
    x: p.x,
    y: yTop - h,
    width: p.w,
    height: h,
    borderColor: border,
    borderWidth: 0.6,
    color: p.cell.fill,
  });
}

function drawCellText(doc: Doc, p: Placed, yTop: number, h: number) {
  const textH = p.lines.length * p.size * 1.18;
  const top = p.cell.valign === "top" ? yTop - PAD_Y - 1 : yTop - Math.max(PAD_Y, (h - textH) / 2);
  doc.drawLines(p.lines, p.x + PAD_X, top, p.w - 2 * PAD_X, p.size, p.cell.align ?? "left");
}

function measureGroup(doc: Doc, t: Table, g: Group, x0: number) {
  const leadCols = (g.lead ?? []).reduce((a, c) => a + (c.colSpan ?? 1), 0);
  const rows = g.rows.map((r) => layoutRow(doc, t, r, leadCols, x0));
  const lead = g.lead ? layoutRow(doc, t, g.lead, 0, x0) : null;
  const total = rows.reduce((a, r) => a + r.h, 0);
  if (lead && lead.h > total && rows.length) rows[rows.length - 1].h += lead.h - total;
  return { rows, lead, height: Math.max(total, lead?.h ?? 0) };
}

/** Draws a table, moving to a new page when needed (and repeating the header if asked). */
function drawTable(doc: Doc, t: Table) {
  const x0 = t.x ?? M.left;
  const header = (t.header ?? []).map((g) => measureGroup(doc, t, g, x0));
  const headerH = header.reduce((a, g) => a + g.height, 0);
  const fullPage = PAGE[1] - M.top - M.bottom;

  const drawGroupWhole = (m: ReturnType<typeof measureGroup>) => drawGroupRows(doc, t, m, true);

  const drawHeader = () => header.forEach(drawGroupWhole);

  const groups = t.groups.map((g) => measureGroup(doc, t, g, x0));
  // Keep the header together with the first group.
  const firstH = headerH + (groups[0]?.height ?? 0);
  if (firstH > doc.avail && firstH <= fullPage) doc.newPage();
  drawHeader();

  for (const m of groups) {
    if (m.height <= doc.avail) {
      drawGroupWhole(m);
    } else if (m.height <= fullPage - (t.repeatHeader ? headerH : 0)) {
      doc.newPage();
      if (t.repeatHeader) drawHeader();
      drawGroupWhole(m);
    } else {
      drawGroupRows(doc, t, m, false, () => {
        doc.newPage();
        if (t.repeatHeader) drawHeader();
      });
    }
  }
}

/** Draws a group's rows. With `split`, rows that don't fit continue on the next page;
 *  the lead cells are drawn on each part, with their text only on the first. */
function drawGroupRows(
  doc: Doc,
  t: Table,
  m: ReturnType<typeof measureGroup>,
  whole: boolean,
  onBreak?: () => void,
) {
  let chunkTop = doc.y;
  let firstChunk = true;
  let drawnInChunk = 0;

  const closeChunk = () => {
    if (!m.lead) return;
    const h = chunkTop - doc.y;
    for (const p of m.lead.placed) {
      drawCellBox(doc, p, chunkTop, h, t.border);
      if (firstChunk) drawCellText(doc, p, chunkTop, h);
    }
  };

  m.rows.forEach((row) => {
    if (!whole && onBreak && row.h > doc.avail) {
      if (drawnInChunk) {
        closeChunk();
        firstChunk = false;
      }
      onBreak();
      chunkTop = doc.y;
      drawnInChunk = 0;
    }
    for (const p of row.placed) {
      drawCellBox(doc, p, doc.y, row.h, t.border);
      drawCellText(doc, p, doc.y, row.h);
    }
    doc.y -= row.h;
    drawnInChunk++;
  });
  if (!m.rows.length && m.lead) doc.y -= m.lead.h;
  closeChunk();
}

// ───────────────────────── The report ─────────────────────────
export async function buildReport(data: ReportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`CO – SDG Mapping – ${data.code} – ${data.name}`);
  pdf.setCreator("CO Mapping");
  const doc = new Doc(pdf);
  await doc.init();

  const outcomes = [...data.outcomes].sort((a, b) => a.co_no - b.co_no);
  const lv = new Map(data.mappings.map((m) => [`${m.kind}:${m.co_no}:${m.num}`, m]));
  const get = (kind: Kind, co: number, num: number) => lv.get(`${kind}:${co}:${num}`);
  const dash = (n: number | undefined) => (n ? String(n) : "-");

  // 1. Title block
  if (data.college) {
    doc.centeredText(data.college.toUpperCase(), 12.5, false);
    doc.y -= 7;
  }
  if (data.department) {
    doc.centeredText(data.department.toUpperCase(), 12.5, false);
    doc.y -= 7;
  }
  doc.centeredText(`CO – SDG MAPPING – ${data.code} – ${data.name}`.toUpperCase(), 12.5, true);
  doc.y -= 12;

  // 2. Course outcomes
  drawTable(doc, {
    widths: [52, W - 52 - 62, 62],
    border: RED,
    size: 9.5,
    groups: [
      { rows: [[{ text: "COURSE OUTCOMES", colSpan: 3, size: 10.5 }]] },
      { rows: [[{ text: "After the completion of the course the student will be able to", colSpan: 2, align: "center" }, { text: "" }]] },
      ...outcomes.map((o) => ({
        rows: [[{ text: `CO${o.co_no}`, align: "center" as const }, { text: o.statement }, { text: o.k_level ?? "" }]],
      })),
    ],
  });
  doc.y -= 22;

  // 3. One WK table per CO, each with its module title and topics
  for (const o of outcomes) {
    const heading: Seg[] = o.title
      ? [{ text: `CO${o.co_no} – ${o.title.toUpperCase()}`, bold: true }, ...(o.topics ? [{ text: ` - ${o.topics}` }] : [])]
      : [{ text: `CO${o.co_no}`, bold: true }, { text: ` – ${o.statement}` }];
    const headLines = doc.wrap(heading, W, 11);
    const headH = headLines.length * 11 * 1.18 + 6;

    const table: Table = {
      widths: [36, 34, W - 70],
      border: BLACK,
      size: 10,
      header: [
        {
          rows: [[
            { text: "WK", bold: true },
            { text: "Level", bold: true },
            { text: "Justification", bold: true, align: "center" },
          ]],
        },
      ],
      groups: WK.map((k) => {
        const m = get("WK", o.co_no, k.num);
        return { rows: [[{ text: `WK${k.num}` }, { text: dash(m?.level), align: "center" as const }, { text: m?.justification ?? "" }]] };
      }),
    };
    // Keep the heading and its table on one page when they fit on a page.
    const tableH = 11 * (10 * 1.18 + 2 * PAD_Y) + 10;
    if (headH + tableH > doc.avail) doc.newPage();
    doc.drawLines(headLines, M.left, doc.y, W, 11, "left");
    doc.y -= headH;
    drawTable(doc, table);
    doc.y -= 20;
  }

  // 4. CO–WK matrix and WK legend
  const mW = 44;
  const matrixWidths = [mW, ...WK.map(() => mW)];
  const matrixX = M.left + (W - mW * 10) / 2;
  const legendRows = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => {
      const k = WK[c * 3 + r];
      return { text: `WK${k.num} – ${k.name}` };
    }),
  );
  const blockH = (outcomes.length + 1) * 17 + 30 + 3 * 28;
  if (blockH > doc.avail) doc.newPage();
  drawTable(doc, {
    x: matrixX,
    widths: matrixWidths,
    border: CYAN,
    size: 11,
    header: [{ rows: [[{ text: "CO", align: "center" }, ...WK.map((k) => ({ text: `WK${k.num}`, align: "center" as const }))]] }],
    groups: outcomes.map((o) => ({
      rows: [[
        { text: `CO${o.co_no}`, align: "center" as const },
        ...WK.map((k) => ({ text: dash(get("WK", o.co_no, k.num)?.level), align: "center" as const })),
      ]],
    })),
  });
  doc.y -= 24;
  drawTable(doc, { widths: [W * 0.285, W * 0.33, W * 0.385], border: BLACK, size: 10, groups: legendRows.map((r) => ({ rows: [r] })) });
  doc.y -= 34;

  // 5. CO–SDG table
  if (doc.avail < 120) doc.newPage();
  doc.centeredText("CO – SDG MAPPING", 14, true);
  doc.y -= 8;
  const sdgW = [36, W * 0.37, W * 0.068, W * 0.056];
  sdgW.push(W - sdgW.reduce((a, b) => a + b, 0));
  drawTable(doc, {
    widths: sdgW,
    border: BLACK,
    size: 10,
    repeatHeader: true,
    header: [
      {
        rows: [[
          { text: "CO", bold: true, align: "center", size: 8.5 },
          { text: "Course Outcome", bold: true, align: "center", size: 8.5 },
          { text: "SDG", bold: true, align: "center", size: 8.5 },
          { text: "Mapping", bold: true, align: "center", size: 8.5 },
          { text: "Justification", bold: true, align: "center", size: 8.5 },
        ]],
      },
    ],
    groups: outcomes.map((o) => {
      const rows = SDG.filter((s) => get("SDG", o.co_no, s.num)).map((s) => {
        const m = get("SDG", o.co_no, s.num)!;
        return [{ text: `SDG ${s.num}`, align: "center" as const }, { text: String(m.level), align: "center" as const }, { text: m.justification }];
      });
      return {
        lead: [
          { text: `CO${o.co_no}`, bold: true, size: 8.5, align: "center" as const },
          { text: o.statement, align: "center" as const },
        ],
        rows: rows.length ? rows : [[{ text: "-", align: "center" as const }, { text: "-", align: "center" as const }, { text: "" }]],
      };
    }),
  });
  doc.y -= 24;

  // 6. SDG legend
  const legendCol = (from: number, to: number): Cell => ({
    valign: "top",
    rich: SDG.slice(from - 1, to).flatMap((s, i) => [
      ...(i ? [{ text: "\n\n" }] : []),
      { text: `${s.num}. ${s.name}`, bold: true },
      { text: ` – ${s.description}` },
    ]),
  });
  drawTable(doc, {
    widths: [W / 3, W / 3, W / 3],
    border: BLACK,
    size: 9.5,
    header: [{ rows: [[{ text: "Sustainable Development Goals (SDGs)", bold: true, align: "center", colSpan: 3, size: 11 }]] }],
    groups: [{ rows: [[legendCol(1, 7), legendCol(8, 12), legendCol(13, 17)]] }],
  });
  doc.y -= 30;

  // 7. CO × SDG matrix
  const cW = (W - 46) / 17;
  const mHeader: Group = {
    lead: [{ text: "CO", bold: true, align: "center", fill: BLUE_LIGHT, size: 11 }],
    rows: [
      [{ rich: [{ text: "Sustainable Development Goals " }, { text: "(SDGs)", bold: true }], colSpan: 17, align: "center", fill: BLUE_FILL }],
      SDG.map((s) => ({ text: String(s.num), align: "center" as const, fill: BLUE_LIGHT })),
    ],
  };
  const sdgMatrixH = (outcomes.length + 2) * 15;
  if (sdgMatrixH > doc.avail) doc.newPage();
  drawTable(doc, {
    widths: [46, ...SDG.map(() => cW)],
    border: BLUE,
    size: 10,
    groups: [
      mHeader,
      ...outcomes.map((o) => ({
        rows: [[
          { text: `CO${o.co_no}`, fill: BLUE_LIGHT, align: "center" as const },
          ...SDG.map((s) => ({ text: dash(get("SDG", o.co_no, s.num)?.level), align: "center" as const })),
        ]],
      })),
    ],
  });

  // 8. CO–PO–PSO matrix on its own page (the NBA "articulation matrix"), with the average of each
  //    column in the last row, followed by a legend of the POs and the programme's PSOs.
  const psos = (data.psos ?? []).filter((t) => t.trim());
  const cols: { kind: Kind; num: number; label: string }[] = [
    ...PO.map((p) => ({ kind: "PO" as Kind, num: p.num, label: `PO${p.num}` })),
    ...psos.map((_, i) => ({ kind: "PSO" as Kind, num: i + 1, label: `PSO${i + 1}` })),
  ];
  const avg = (c: { kind: Kind; num: number }) => {
    const v = outcomes.map((o) => get(c.kind, o.co_no, c.num)?.level ?? 0).filter((x) => x > 0);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "-";
  };
  doc.newPage();
  doc.centeredText(`CO – PO – PSO MAPPING – ${data.code} – ${data.name}`.toUpperCase(), 13, true);
  doc.y -= 12;
  const pcW = (W - 50) / cols.length;
  drawTable(doc, {
    widths: [50, ...cols.map(() => pcW)],
    border: BLUE,
    size: 10,
    groups: [
      { rows: [[{ text: "CO", bold: true, align: "center", fill: BLUE_FILL }, ...cols.map((c) => ({ text: c.label, bold: true, align: "center" as const, fill: BLUE_FILL }))]] },
      ...outcomes.map((o) => ({
        rows: [[
          { text: `CO${o.co_no}`, fill: BLUE_LIGHT, align: "center" as const },
          ...cols.map((c) => ({ text: dash(get(c.kind, o.co_no, c.num)?.level), align: "center" as const })),
        ]],
      })),
      { rows: [[{ text: "Average", bold: true, align: "center", fill: BLUE_LIGHT }, ...cols.map((c) => ({ text: avg(c), bold: true, align: "center" as const }))]] },
    ],
  });
  doc.y -= 8;
  doc.drawLines(doc.wrap([{ text: "3 – High, 2 – Medium, 1 – Low, \"-\" – no correlation. Average = mean of the non-zero levels in the column." }], W, 9), M.left, doc.y, W, 9, "left");
  doc.y -= 24;

  // PO names (3 per row) and the PSO statements in full.
  const poRows: Cell[][] = [];
  for (let i = 0; i < PO.length; i += 3) {
    const row: Cell[] = PO.slice(i, i + 3).map((p) => ({ rich: [{ text: `PO${p.num}`, bold: true }, { text: ` – ${p.name}` }] }));
    while (row.length < 3) row.push({ text: "" });
    poRows.push(row);
  }
  drawTable(doc, {
    widths: [W / 3, W / 3, W / 3],
    border: BLACK,
    size: 9.5,
    header: [{ rows: [[{ text: "Programme Outcomes (POs)", bold: true, align: "center", colSpan: 3, size: 10.5 }]] }],
    groups: poRows.map((r) => ({ rows: [r] })),
  });
  if (psos.length) {
    doc.y -= 14;
    drawTable(doc, {
      widths: [50, W - 50],
      border: BLACK,
      size: 9.5,
      header: [{ rows: [[{ text: "Programme Specific Outcomes (PSOs)", bold: true, align: "center", colSpan: 2, size: 10.5 }]] }],
      groups: psos.map((t, i) => ({ rows: [[{ text: `PSO${i + 1}`, bold: true, align: "center" as const }, { text: t }]] })),
    });
  }

  return pdf.save();
}
