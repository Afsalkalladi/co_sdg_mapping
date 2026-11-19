// ──────────────────────────────────────────────────────────────────────
// WHAT: The "404 – page not found" page. A Next.js special file: shown for unknown addresses and
//       whenever a page calls notFound() (e.g. a subject id that doesn't exist).
// ──────────────────────────────────────────────────────────────────────

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">This page doesn’t exist, or the subject was deleted.</p>
        <Link href="/" className="btn btn-primary mt-4">
          Go to subjects
        </Link>
      </div>
    </main>
  );
}
