# CO Mapping

A website for mapping each subject's **course outcomes (COs)** to the **WK knowledge profile (WK1–WK9)** and the **SDGs (SDG1–SDG17)**, and exporting a PDF in the college's CO–SDG mapping format (EET413 layout). Subjects and COs come from Excel; an **AI suggests the WK/SDG mapping**; faculty review it and export the PDF.

**Stack:** Next.js 16 + React 19 + TypeScript · Tailwind CSS 4 · Supabase (database + sign-in) · pdf-lib (PDF) · SheetJS (Excel) · any OpenAI-compatible AI (Gemini by default).

**New to Next.js?** Read [docs/NEXTJS_GUIDE.md](docs/NEXTJS_GUIDE.md): how Next.js works, explained with this project's own files.

---

## How it works

1. **Pick the scheme and semester** at the top of the Subjects page (add a scheme with *+ New scheme…*).
2. **Import from Excel**: subjects and their COs in one go (or add a subject by hand with *New subject*).
   One row per CO: `Scheme | Semester | Course Code | Course Name | Department | CO | CO Statement | K Level | Module Title | Topics`
   (only Course Code, Course Name, CO and CO Statement are required; *Download a template* in the import dialog).
   A row per subject with `CO1, CO2, …` columns also works. Re-importing a subject updates it: its COs become the COs in the file.
3. **Open a subject → Map with AI**: every CO is mapped to WK1–9 and SDG1–17 with a level (1–3) and a one-line justification.
4. **Review**: click any cell to change its level or justification. *Re-map with AI* asks again (replacing the AI's and your edits).
5. **Export PDF**: course outcomes · WK table per CO · CO–WK matrix + legend · CO–SDG table · SDG legend · CO×SDG matrix.

Without an AI key, *Map with AI* shows a prompt to paste into any AI chat; paste its answer back with *Paste AI table…*.

**Roles:** *Viewer* (view + export) · *Editor* (also import, edit, map) · *Admin* (also Settings: college name, allowed email domain, people). The first person to sign in becomes admin.

---

## Setup

### 1. Database
Supabase → **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
It creates everything (tables, access rules, functions). ⚠ Running it again deletes all subjects.

### 2. Sign-in settings (Supabase → Authentication)
- **URL Configuration**: Site URL = your site's address; Redirect URLs: add `<your address>/auth/callback`
  (for local use: `http://localhost:3000` and `http://localhost:3000/auth/callback`).
- **Email**: the built-in sender allows only a few emails per hour. Set up SMTP (*Authentication → Emails → SMTP*) before inviting people, or create accounts under **Users → Add user** (tick *Auto Confirm*) and sign in with a password.

### 3. Environment variables (`.env.local`; on Vercel: *Project → Settings → Environment Variables*)
| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys → Publishable key (`sb_publishable_…`). Never the secret key. |
| `AI_API_KEY` | AI provider key (free Gemini key: https://aistudio.google.com/apikey). Server only. |
| `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` (Gemini) · `https://api.groq.com/openai/v1` (Groq) · `https://openrouter.ai/api/v1` |
| `AI_MODEL` | e.g. `gemini-3.8-flash` (Gemini) or `openai/gpt-oss-120b` (Groq). Check the provider's list if it stops working. |
| `AI_REASONING_EFFORT` | optional: `low` (default for Gemini) · `none` if answers are slow · `off` to not send it |
| `NEXT_PUBLIC_GOOGLE_AUTH` | optional: `true` shows "Continue with Google" (set up Google in Supabase first) |

Free AI tiers have per-minute/per-day limits; the app waits and retries. Gemini's free tier may use what you send to improve Google's products.

### 4. Run locally
```bash
npm install
npm run dev          # http://localhost:3000 (restart after changing .env.local)
```

### 5. First steps in the app
**Settings** → college name (printed at the top of every PDF) and, optionally, your college email domain. Then **Import from Excel**.

---

## Going live (production)

1. **Check the build** on your computer: `npm run build` then `npm start` (serves the optimised site on http://localhost:3000).
2. **Push the folder to GitHub** (the `.gitignore` already keeps `node_modules`, `.next` and `.env.local` out).
3. **Vercel** → *Add New → Project* → import the repository → add the environment variables from step 3 → **Deploy**.
4. **Supabase → Authentication → URL Configuration**: set the Site URL to the Vercel address and add `<address>/auth/callback` to Redirect URLs.
5. Before real use: **Supabase Pro plan** (free projects pause after a week of inactivity and have no backups) and **SMTP** for sign-in emails.

Already built in: security headers (`next.config.ts`), friendly error / loading / not-found pages, the AI key and database rules kept on the server, and the PDF and Excel code loaded only when a button needs it.

---

## Project layout
```
app/                        PAGES (folders = web addresses; see docs/NEXTJS_GUIDE.md)
  layout.tsx                outer HTML shell for every page
  not-found.tsx             "page not found"
  login/page.tsx            /login – sign-in (email link or password)
  auth/callback/route.ts    finishes email-link / Google sign-in
  auth/signout/route.ts     signs out
  (main)/layout.tsx         header for signed-in pages (the "(main)" folder isn't part of the address)
  (main)/loading.tsx        spinner while a page loads
  (main)/error.tsx          "something went wrong" with a Try again button
  (main)/page.tsx           /  – subject list
  (main)/subjects/[id]/     /subjects/12 – one subject: COs, WK/SDG grids, Map with AI, Export PDF
  (main)/settings/          /settings – college name, allowed domain, people (admins)
  api/suggest/route.ts      POST /api/suggest – AI mapping (server only)
components/                 UI pieces that run in the browser
  SubjectList.tsx           scheme/semester dropdowns, subject cards, new/edit subject form
  ImportDialog.tsx          import subjects + COs from Excel, with a preview
  SubjectEditor.tsx         the subject page
  OutcomeDialogs.tsx        add/edit a CO, paste many COs
  MappingDialog.tsx         set one cell's level + justification
  AiDialogs.tsx             manual AI route: copy prompt, paste answer
  SettingsPanel.tsx         settings + people
  Modal.tsx                 pop-up, confirm pop-up, error line
lib/                        logic without UI
  reference.ts              WK1–9, SDG1–17, K-levels, semesters
  excel.ts                  reads subjects + COs from Excel/CSV; the import template
  ai.ts                     builds the AI prompt; reads the AI's table
  ai-server.ts              calls the AI provider (server only; holds the key)
  pdf/report.ts             draws the PDF
  supabase/client.ts        database connection for browser code
  supabase/server.ts        database connection for server code
  data.ts, types.ts         sign-in checks, data shapes
proxy.ts                    runs before every request: session refresh, sign-in redirect
next.config.ts              Next.js settings + security headers
supabase/schema.sql         the whole database: tables, access rules, functions
docs/NEXTJS_GUIDE.md        how Next.js works, using this project as the example
```

## Database
`subjects` (scheme, semester, code, name, department) → `outcomes` (CO no, statement, K-level, module title/topics) → `mappings` (WK/SDG, number, level 1–3, justification, source manual/ai).
`profiles` (role per person) · `settings` (college name, allowed domain) · view `subject_summary` (list counts) · functions `replace_mappings` (saves AI results) and `import_subjects` (Excel import). Every table has row-level security: viewers read, editors and admins write.

## Commands
| | |
|---|---|
| `npm run dev` | development server with instant reload |
| `npm run build` | production build (also type-checks) |
| `npm start` | serve the production build |
| `npm run typecheck` | type-check only |
