# How Next.js works, explained with this project

This guide explains the ideas behind Next.js using the files of the CO Mapping app as examples. Read it top to bottom once; afterwards use the headings as a reference. File names in `code` are real files in this project. Open them side by side.

---

## 1. The big picture

A website has two sides:

| | Browser (the user's computer) | Server (our computer / Vercel) |
|---|---|---|
| Shows | buttons, dialogs, grids | nothing: it only answers requests |
| Knows | only what we send it | secrets: the AI key, database session |
| Language here | TypeScript + React | TypeScript + React + Node.js |

**React** is a library for building screens out of small reusable pieces called *components*.
**Next.js** is a *framework* built on React. It adds what a real website needs:

- **Routing**: which file is shown for which web address (`/settings` → `app/(main)/settings/page.tsx`).
- **Server code**: pages can load data on the server before they are sent, and API routes can keep secrets.
- **Building**: turns our TypeScript into small, fast files for production (`npm run build`).

**Supabase** is our database and sign-in service. **Vercel** is where the site will run online.

```
 Browser ──request /subjects/12──▶ proxy.ts ──▶ app/(main)/layout.tsx ──▶ app/(main)/subjects/[id]/page.tsx
   ▲                                  (checks sign-in)   (header)              (loads data from Supabase)
   │                                                                                     │
   └──────── HTML + a little JavaScript (SubjectEditor) ◀────────────────────────────────┘
```

---

## 2. React in five minutes

### Components
A component is a function that returns what to show. The HTML-like syntax inside is **JSX**.

```tsx
// components/SubjectList.tsx (simplified)
function Chip({ ok, children }) {
  return <span className={ok ? "bg-green-50" : "bg-stone-100"}>{children}</span>;
}

// using it:
<Chip ok={r.co_count > 0}>{r.co_count} COs</Chip>
```

- `{ ... }` inside JSX means "run this JavaScript": `{r.co_count}` prints a number.
- `className` is HTML's `class` (the words are Tailwind styles, see section 9).

### Props
**Props** are the inputs of a component, like function arguments. Above, `ok` and `children` are props.
`app/(main)/subjects/[id]/page.tsx` passes props to the big editor:

```tsx
<SubjectEditor subject={subject} outcomes={outcomes} mappings={mappings} canEdit={canEdit(profile)} ... />
```

### State
**State** is data a component remembers and can change. When state changes, React re-draws the component.

```tsx
// components/SubjectEditor.tsx
const [tab, setTab] = useState<Kind>("WK");      // which grid is showing
...
<button onClick={() => setTab("SDG")}>CO–SDG</button>   // click → state changes → screen updates
```

`useState`, `useEffect`, `useMemo` are **hooks**: React functions whose names start with `use`.

| Hook | Meaning | Example in this project |
|---|---|---|
| `useState` | remember a value | which dialog is open, the search text |
| `useEffect` | do something *after* drawing, when something changes | `SubjectList` writes the filters into the address bar |
| `useMemo` | compute once, reuse until inputs change | `byKey`, the quick lookup of mappings in `SubjectEditor` |

### Events
`onClick`, `onChange`, `onSubmit` connect user actions to functions:
```tsx
<select value={scheme} onChange={(e) => setScheme(e.target.value)}>
```

---

## 3. Routing: folders are web addresses

Next.js uses the **App Router**: everything under `app/` is a route. The rule:

> **A folder = a part of the address. A `page.tsx` inside it = what is shown at that address.**

| Address | File |
|---|---|
| `/` | `app/(main)/page.tsx` |
| `/login` | `app/login/page.tsx` |
| `/settings` | `app/(main)/settings/page.tsx` |
| `/subjects/12` | `app/(main)/subjects/[id]/page.tsx` |
| `POST /api/suggest` | `app/api/suggest/route.ts` |
| `/auth/callback` | `app/auth/callback/route.ts` |

### Special folder names
- **`[id]` (square brackets) = dynamic segment.** One file serves every subject. The page receives the value:
  ```tsx
  export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
    const id = Number((await params).id);   // "/subjects/12" → id = 12
  ```
- **`(main)` (round brackets) = route group.** The folder is *not* part of the address. It only groups pages that share something; here, the header in `app/(main)/layout.tsx`. So `/settings` (not `/main/settings`).

### Special file names
Next.js gives fixed file names a fixed meaning:

| File | Meaning | In this project |
|---|---|---|
| `page.tsx` | the content of an address | subject list, subject page, settings, login |
| `layout.tsx` | wraps every page in its folder (and sub-folders); stays on screen when you move between them | `app/layout.tsx` (html/body/font), `app/(main)/layout.tsx` (header) |
| `loading.tsx` | shown instantly while a page loads its data | `app/(main)/loading.tsx` (spinner) |
| `error.tsx` | shown if a page fails | `app/(main)/error.tsx` ("Try again") |
| `not-found.tsx` | the 404 page | `app/not-found.tsx` |
| `route.ts` | an API endpoint instead of a page (returns data, not HTML) | `app/api/suggest/route.ts` |

Layouts **nest**: `/settings` is drawn as
`app/layout.tsx` → `app/(main)/layout.tsx` → `app/(main)/settings/page.tsx`.

### Query strings
`/?scheme=2019%20Scheme&sem=5`: the part after `?` arrives as `searchParams`:
```tsx
// app/(main)/page.tsx
export default async function SubjectsPage({ searchParams }) {
  const sp = await searchParams;     // { scheme: "2019 Scheme", sem: "5" }
```
(In Next.js 15/16, `params` and `searchParams` are *Promises*, hence `await`.)

---

## 4. Server components and client components

This is the most important Next.js idea.

**By default every component is a Server Component.** It runs on the server, can be `async`, can read the database and secrets, and sends finished HTML to the browser. **Its code never reaches the browser.**

A file that starts with **`"use client"`** contains **Client Components**. They are sent to the browser and can use state, effects and click handlers.

| | Server component | Client component (`"use client"`) |
|---|---|---|
| Runs | on the server, once per request | in the browser (also pre-drawn on the server) |
| Can use | `async/await`, database, secrets (`AI_API_KEY`) | `useState`, `useEffect`, `onClick`, browser APIs |
| Can't use | state, clicks | secrets, server-only code |
| Here | every `page.tsx` except login, both `layout.tsx` files, `not-found.tsx` | everything in `components/`, `app/login/page.tsx`, `app/(main)/error.tsx` |

### The pattern used everywhere in this project
**The server page fetches; the client component shows and edits.**

```tsx
// app/(main)/subjects/[id]/page.tsx: SERVER
const { data: subject } = await supabase.from("subjects").select("...").eq("id", id).maybeSingle();
...
return <SubjectEditor subject={subject} outcomes={outcomes} mappings={mappings} aiEnabled={aiConfigured()} />;
```
```tsx
// components/SubjectEditor.tsx: CLIENT
"use client";
export default function SubjectEditor(p: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);   // interactive
  ...
```

Why split like this?
- Data arrives **with** the first HTML: no blank page, no extra loading round-trip.
- Secrets stay on the server: `aiConfigured()` checks the AI key on the server and only sends `true/false`.
- Only interactive parts ship JavaScript to the browser, which keeps pages fast.

Rule: props passed from server to client must be plain data (text, numbers, arrays, objects), not functions.

**Hydration**: the browser first receives HTML (fast to show), then React "hydrates" it, attaching the click handlers so buttons start working.

---

## 5. How data gets to the screen and back

### Reading (on the server)
`lib/supabase/server.ts` creates a database client that knows who is signed in (from cookies). Pages call it:
```tsx
const supabase = await createClient();
const { data } = await supabase.from("subject_summary").select("*").order("semester");
```
The database's **row-level security** (in `supabase/schema.sql`) decides what each person may see or change, so even a mistake in the app can't let a viewer edit.

### Writing (from the browser)
Client components use `lib/supabase/client.ts`:
```tsx
// components/MappingDialog.tsx
await supabase.from("mappings").upsert({ outcome_id, kind, num, level, justification, source: "manual" });
```
Then they ask Next.js to re-run the server page so the screen shows fresh data:
```tsx
router.refresh();   // re-fetch on the server, keep the client state (open tab, scroll position)
```

### Calling server code (API routes)
Some work must happen on the server: calling the AI needs the secret key. That is what `route.ts` files are for.

```ts
// app/api/suggest/route.ts: SERVER
export async function POST(request: Request) {
  const body = await request.json();                 // { subjectId, coNos }
  ...
  const answer = await askAi(buildPrompt(...));      // uses AI_API_KEY, never sent to the browser
  ...
  return NextResponse.json({ saved: parsed.rows.length });
}
```
```ts
// components/SubjectEditor.tsx: CLIENT, inside runAi()
const res = await fetch("/api/suggest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subjectId: p.subject.id, coNos: b }),
});
const j = await res.json();
```
The exported function's **name** is the HTTP method: `GET`, `POST`, `PUT`, `DELETE`.
HTTP **status codes** used: 200 ok · 400 bad request · 401 not signed in · 403 not allowed · 404 not found · 429 too many requests · 5xx server/AI problem.

---

## 6. Following one click from start to finish: "Map with AI"

1. **Click**: `SubjectEditor` → `startMapping()` → `runAi([1,2,3,4,5,6])`.
2. **Batches**: `runAi` splits the COs into pairs and, for each pair, `fetch("/api/suggest")`.
3. **proxy.ts** runs first: the person is signed in, so the request continues.
4. **`app/api/suggest/route.ts`**: checks the role → loads the two COs → `buildPrompt()` (`lib/ai.ts`) → `askAi()` (`lib/ai-server.ts`) sends it to Gemini.
5. **Gemini** answers with a CSV table → `parseAiTable()` turns it into rows.
6. **Database**: `supabase.rpc("replace_mappings", …)` runs the SQL function from `schema.sql`, replacing those COs' mappings in one transaction.
7. **Back in the browser**: `router.refresh()` → the server page re-runs → the new grid values appear. The status box shows progress.
8. **Export PDF**: `exportPdf()` loads `lib/pdf/report.ts` and draws the PDF in the browser; no server needed.

---

## 7. Navigation

| Tool | Where | What |
|---|---|---|
| `<Link href="/settings">` | any component | a link that changes page **without reloading** the whole site |
| `useRouter()` → `router.push(url)` | client | go to a page from code (after creating a subject) |
| `router.refresh()` | client | reload the current page's server data |
| `redirect("/login")` | server | send the person elsewhere (`lib/data.ts`) |
| `notFound()` | server | show `not-found.tsx` (unknown subject id) |

---

## 8. proxy.ts (formerly "middleware")

`proxy.ts` runs **before every request** that matches its `config.matcher`. Here it:
1. refreshes the sign-in session stored in cookies (Supabase sessions expire and are renewed here), and
2. redirects signed-out visitors to `/login`.

It runs before any page code, so pages can assume a signed-in user. They still double-check with `requireProfile()`.

---

## 9. Styling with Tailwind CSS

Instead of separate CSS files, styles are short class names right on the element:

```tsx
<div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
```
`rounded-xl` = rounded corners · `p-4` = padding · `bg-white` = background · `sm:p-5` = bigger padding on screens ≥ 640 px (this is how the phone layout works).
Shared shortcuts (`.btn`, `.card`, `.input`, `.label`) are defined once in `app/globals.css`.

---

## 10. Environment variables

Settings and secrets live in `.env.local` (never committed to git) or in Vercel's settings.

| Prefix | Visible in the browser? | Example |
|---|---|---|
| `NEXT_PUBLIC_…` | **yes**: copied into the browser code at build time | `NEXT_PUBLIC_SUPABASE_URL`, the publishable key |
| no prefix | **no**: server only | `AI_API_KEY` |

Read them with `process.env.NAME`. After changing `.env.local`, restart `npm run dev`.

---

## 11. Loading code only when needed (dynamic import)

The PDF library and the Excel library are large. They are only downloaded when a button needs them:
```ts
const { buildReport } = await import("@/lib/pdf/report");   // in exportPdf()
const { parseSubjectsFile } = await import("@/lib/excel");  // in ImportDialog
```
Next.js splits these into separate files ("code splitting"), so normal pages load faster.

`@/` is a shortcut for the project folder (set in `tsconfig.json`): `@/lib/ai` = `lib/ai.ts`.

---

## 12. TypeScript you will see

TypeScript is JavaScript plus **types** (descriptions of what a value looks like). Types are checked by the editor and by `npm run build`; they are removed before the code runs.

| Syntax | Meaning |
|---|---|
| `const x: number = 5` | x must be a number |
| `type Subject = { id: number; code: string; semester: number \| null }` | a shape (`lib/types.ts`); `\|` = "or" |
| `title?: string` | optional property |
| `value!` | "trust me, this isn't null" |
| `as Subject[]` | "treat this as …" |
| `async function f()` / `await x` | wait for something slow (database, AI, file) without freezing |
| `Promise<T>` | a value that will arrive later |
| `export` / `import` | share code between files |
| `export default` | the file's main export (every `page.tsx` must have one) |
| `(a) => a + 1` | a short ("arrow") function |
| `` `CO${n}` `` | text with a value inserted |
| `x ?? "default"` | use "default" if x is null/undefined |
| `obj?.name` | `undefined` instead of an error if obj is missing |

---

## 13. Running and building

| Command | What happens |
|---|---|
| `npm install` | downloads the libraries listed in `package.json` into `node_modules/` |
| `npm run dev` | development server: rebuilds instantly when you save a file; shows detailed errors |
| `npm run build` | production build: type-checks, optimises and bundles everything into `.next/` |
| `npm start` | serves the production build |

`.next/` and `node_modules/` are generated. Never edit them, and they aren't committed to git.
On **Vercel**, pushing to GitHub runs `npm run build` automatically and puts the result online; server code (pages, `route.ts`, `proxy.ts`) runs as on-demand "serverless functions".

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Component** | a function that returns UI (JSX) |
| **JSX** | HTML-like syntax inside TypeScript |
| **Props** | inputs to a component |
| **State** | data a component remembers (`useState`) |
| **Hook** | a React function starting with `use…` |
| **Server Component** | runs on the server only; can fetch data and use secrets |
| **Client Component** | file starts with `"use client"`; runs in the browser; interactive |
| **Hydration** | the browser attaching interactivity to server-made HTML |
| **Route** | an address handled by a `page.tsx` or `route.ts` |
| **Layout** | shared wrapper around pages (`layout.tsx`) |
| **Dynamic segment** | `[id]` folder: one page for many addresses |
| **Route group** | `(name)` folder: groups pages, not part of the address |
| **Route handler / API route** | `route.ts` exporting `GET`/`POST`…; returns data |
| **Proxy (middleware)** | `proxy.ts`, runs before every request |
| **SSR** | server-side rendering: HTML made on the server per request |
| **Fetch** | the browser/server function for calling an address (`fetch("/api/suggest")`) |
| **JSON** | text format for data: `{"saved": 12}` |
| **Environment variable** | a setting/secret outside the code (`.env.local`) |
| **RLS** | row-level security: database rules deciding who may read/write each row |
| **RPC** | calling a database function from code (`supabase.rpc("replace_mappings")`) |
| **Build** | turning source code into optimised production files |
| **Deploy** | putting the build online (Vercel) |

---

## 15. Where to look when presenting

| Question | Open |
|---|---|
| "What pages are there?" | the `app/` folder (section 3) |
| "How does a page get its data?" | `app/(main)/subjects/[id]/page.tsx` |
| "What does the user see and click?" | `components/SubjectEditor.tsx` |
| "How does the AI part work?" | `app/api/suggest/route.ts` → `lib/ai.ts` → `lib/ai-server.ts` |
| "How is the PDF made?" | `lib/pdf/report.ts` |
| "How is Excel imported?" | `components/ImportDialog.tsx` → `lib/excel.ts` → `import_subjects` in `supabase/schema.sql` |
| "Who can do what?" | access rules (section 4) in `supabase/schema.sql` |
| "How is sign-in handled?" | `app/login/page.tsx`, `app/auth/callback/route.ts`, `proxy.ts` |

Every file starts with a comment block saying what it does. Read those first.
