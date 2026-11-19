"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: Small shared UI pieces (browser):
//   Modal         -> the pop-up window used by every dialog (closes on Esc or clicking outside).
//   ErrorNote     -> a red error message line.
//   ConfirmDialog -> "Are you sure?" pop-up that runs an action (e.g. delete) and shows any error.
// ──────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-xl leading-none text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{message}</p>;
}

export function ConfirmDialog({
  title,
  text,
  action = "Delete",
  run,
  onClose,
  onDone,
}: {
  title: string;
  text: string;
  action?: string;
  run: () => PromiseLike<{ error: { message: string } | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{text}</p>
      <ErrorNote message={error} />
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn border-red-700 bg-red-700 text-white hover:bg-red-800"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await run();
            setBusy(false);
            if (error) return setError(error.message);
            onDone();
          }}
        >
          {busy ? "Working…" : action}
        </button>
      </div>
    </Modal>
  );
}
