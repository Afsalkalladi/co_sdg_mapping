// ──────────────────────────────────────────────────────────────────────
// WHAT: TypeScript "shapes" of the data, matching the database tables (profiles, settings, subjects,
//       outcomes, mappings). They only help the editor catch mistakes; they don't run.
// ──────────────────────────────────────────────────────────────────────

import type { Kind } from "@/lib/reference";

export type Role = "admin" | "editor" | "viewer";

export type Profile = { id: string; email: string; full_name: string | null; role: Role; created_at?: string };
export type Settings = { college_name: string; allowed_email_domain: string | null; psos: string[] };

export type Subject = {
  id: number;
  scheme: string;
  semester: number | null;
  code: string;
  name: string;
  department: string;
  updated_at?: string;
};

export type Outcome = {
  id: number;
  subject_id: number;
  co_no: number;
  statement: string;
  k_level: string | null;
  title: string;
  topics: string;
};

export type Mapping = {
  outcome_id: number;
  kind: Kind;
  num: number;
  level: number;
  justification: string;
  source: "manual" | "ai";
};
