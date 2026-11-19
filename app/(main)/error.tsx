"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: Shown instead of a page when something goes wrong while loading it (e.g. the database is
//       unreachable). A Next.js "special file": error.tsx catches errors of every page in this folder.
// NOTE: Must be a client component. The header from layout.tsx stays visible above it.
//       `reset()` tries to render the page again.
// ──────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Keep the technical details in the browser console for whoever is debugging.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card mx-auto max-w-lg text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page couldn’t be loaded. Check your internet connection and try
        again. If it keeps happening, tell the administrator
        {error.digest ? ` (reference: ${error.digest})` : ""}.
      </p>
      <button className="btn btn-primary mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
