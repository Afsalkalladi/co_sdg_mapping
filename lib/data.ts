// ──────────────────────────────────────────────────────────────────────
// WHAT: Server helpers used by the pages:
//   requireProfile() -> the signed-in person's profile, or redirect to /login.
//   requireAdmin()   -> same, but only admins (others go back to "/").
//   canEdit()        -> true for editors and admins.
// ──────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in person's profile; sends them to /login if there is none. */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data) redirect("/login?error=profile");
  return data as Profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}

export const canEdit = (p: Profile) => p.role === "admin" || p.role === "editor";
