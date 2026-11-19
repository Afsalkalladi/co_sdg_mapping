// ──────────────────────────────────────────────────────────────────────
// WHAT: Shown immediately while a signed-in page is loading its data on the server.
//       A Next.js "special file": loading.tsx covers every page in this folder.
// ──────────────────────────────────────────────────────────────────────

export default function Loading() {
  return (
    <div className="flex items-center gap-3 py-16 text-sm text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
      Loading…
    </div>
  );
}
