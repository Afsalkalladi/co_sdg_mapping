"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: The Settings page UI (browser), admins only:
//   - College name (printed at the top of every PDF) and the allowed sign-up email domain.
//   - People: change each person's role (Viewer / Editor / Admin). You can't change your own role.
// ──────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote } from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Role, Settings } from "@/lib/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "viewer", label: "Viewer – can view and export" },
  { value: "editor", label: "Editor – can also edit subjects" },
  { value: "admin", label: "Admin – can also manage settings and people" },
];

export default function SettingsPanel({ meId, settings, profiles }: { meId: string; settings: Settings; profiles: Profile[] }) {
  const router = useRouter();
  const [college, setCollege] = useState(settings.college_name);
  const [domain, setDomain] = useState(settings.allowed_email_domain ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save the college name and the allowed email domain (only admins pass the database rules).
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await createClient()
      .from("settings")
      .update({ college_name: college.trim(), allowed_email_domain: domain.trim().replace(/^@/, "").toLowerCase() || null })
      .eq("id", true);
    if (error) return setError(error.message);
    setSaved(true);
    router.refresh();
  }

  // Change someone's role. Takes effect on their next page load.
  async function setRole(p: Profile, role: Role) {
    setError(null);
    const { error } = await createClient().from("profiles").update({ role }).eq("id", p.id);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ErrorNote message={error} />

      <form onSubmit={saveSettings} className="card space-y-4">
        <div>
          <label className="label">College name (first line of every PDF)</label>
          <input
            className="input"
            value={college}
            onChange={(e) => {
              setCollege(e.target.value);
              setSaved(false);
            }}
            placeholder="Government Engineering College Thrissur"
          />
        </div>
        <div>
          <label className="label">Only allow sign-ups from this email domain (leave empty to allow anyone)</label>
          <input
            className="input"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setSaved(false);
            }}
            placeholder="college.ac.in"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary">Save</button>
          {saved && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      </form>

      <section className="card !p-0">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="font-semibold">People</h2>
          <p className="text-sm text-slate-500">People appear here after their first sign-in. New people start as viewers.</p>
        </div>
        <ul className="mt-3 divide-y divide-stone-200">
          {profiles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.full_name || p.email}</div>
                {p.full_name && <div className="truncate text-sm text-slate-500">{p.email}</div>}
              </div>
              <select
                className="input w-auto"
                value={p.role}
                disabled={p.id === meId}
                title={p.id === meId ? "You can't change your own role" : undefined}
                onChange={(e) => setRole(p, e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
