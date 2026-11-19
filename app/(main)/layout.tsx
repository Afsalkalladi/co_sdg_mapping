// ──────────────────────────────────────────────────────────────────────
// WHAT: Layout for every signed-in page: the top header (app name, Subjects, Settings, user name, Sign out).
// NOTE: The "(main)" folder name is a Next.js "route group": the brackets mean it does NOT appear in the URL.
//       It only groups pages that share this header. requireProfile() also blocks signed-out visitors.
// ──────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { requireProfile } from "@/lib/data";

const ROLE = { admin: "Admin", editor: "Editor", viewer: "Viewer" } as const;

/** Header shared by every signed-in page. */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="font-bold">
            CO Mapping
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-stone-100 hover:text-slate-900">
              Subjects
            </Link>
            {profile.role === "admin" && (
              <Link href="/settings" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-stone-100 hover:text-slate-900">
                Settings
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block max-w-[220px] truncate">{profile.full_name || profile.email}</span>
              <span className="text-xs text-slate-500">{ROLE[profile.role]}</span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="btn">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </>
  );
}
