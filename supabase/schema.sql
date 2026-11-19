-- ════════════════════════════════════════════════════════════════════
--  CO–WK–SDG Mapping: complete database setup
--
--  Run this ONCE in Supabase → SQL Editor.
--  ⚠  It deletes ALL subjects, course outcomes and mappings (and any tables
--     from the earlier version of this app) and creates a clean database.
--     User accounts are kept; the earliest account becomes admin.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── 1. Remove everything from earlier versions ───────────────
drop trigger if exists on_auth_user_created on auth.users;
drop view  if exists public.course_target_max;
drop view  if exists public.subject_summary;
drop table if exists
  public.mapping_history, public.import_log, public.course_editors, public.mappings,
  public.course_outcomes, public.courses, public.targets, public.app_settings,
  public.outcomes, public.subjects, public.settings, public.profiles
cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('import_dataset', 'target_coverage', 'can_edit_co', 'can_edit_course', 'is_admin',
                        'current_role_name', 'handle_new_user', 'touch_updated_at', 'stamp_mapping',
                        'log_mapping_change', 'can_edit', 'replace_mappings', 'import_subjects')
  loop
    execute 'drop function if exists ' || r.fn || ' cascade';
  end loop;
end $$;

drop type if exists public.target_type cascade;
drop type if exists public.app_role cascade;

-- ─────────────── 2. Tables ───────────────
create type public.app_role as enum ('admin', 'editor', 'viewer');

-- One row per person who has signed in.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Single row: the college name printed on every PDF, and who may sign up.
create table public.settings (
  id                   boolean primary key default true check (id),
  college_name         text not null default '',
  allowed_email_domain text
);
insert into public.settings (id) values (true);

-- A subject (course), e.g. EET413 Electric Drives, in a scheme (e.g. "2019 Scheme") and semester.
create table public.subjects (
  id          bigint generated always as identity primary key,
  scheme      text not null default '',
  semester    smallint check (semester between 1 and 10),
  code        text not null,
  name        text not null,
  department  text not null default '',          -- printed in the PDF header
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (scheme, code)
);

-- Course outcomes of a subject.
create table public.outcomes (
  id          bigint generated always as identity primary key,
  subject_id  bigint not null references public.subjects (id) on delete cascade,
  co_no       smallint not null check (co_no between 1 and 20),   -- 1 = CO1
  statement   text not null,
  k_level     text check (k_level ~ '^K[1-6]$'),                   -- Bloom level, e.g. K2
  title       text not null default '',   -- module title, e.g. FUNDAMENTALS AND DYNAMICS OF DRIVES
  topics      text not null default '',   -- module topics shown under the title in the PDF
  unique (subject_id, co_no)
);
create index on public.outcomes (subject_id);

-- CO → WK (1–9) and CO → SDG (1–17). A row exists only for levels 1–3; no row means "–".
create table public.mappings (
  outcome_id    bigint not null references public.outcomes (id) on delete cascade,
  kind          text not null check (kind in ('WK', 'SDG')),
  num           smallint not null,
  level         smallint not null check (level between 1 and 3),
  justification text not null default '',
  source        text not null default 'manual' check (source in ('manual', 'ai')),
  primary key (outcome_id, kind, num),
  check ((kind = 'WK' and num between 1 and 9) or (kind = 'SDG' and num between 1 and 17))
);

-- Subject list with progress counts (respects the access rules of the tables it reads).
create view public.subject_summary with (security_invoker = true) as
select s.id, s.scheme, s.semester, s.code, s.name, s.department, s.updated_at,
       (select count(*) from public.outcomes o where o.subject_id = s.id)::int as co_count,
       (select count(*) from public.mappings m join public.outcomes o on o.id = m.outcome_id
         where o.subject_id = s.id and m.kind = 'WK')::int  as wk_count,
       (select count(*) from public.mappings m join public.outcomes o on o.id = m.outcome_id
         where o.subject_id = s.id and m.kind = 'SDG')::int as sdg_count
from public.subjects s;

-- ─────────────── 3. Helper functions ───────────────
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'editor') from public.profiles where id = auth.uid()), false)
$$;

-- New sign-up → profile. First person ever = admin. Optional email-domain restriction.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  select allowed_email_domain into dom from public.settings where id;
  if coalesce(dom, '') <> '' and lower(split_part(new.email, '@', 2)) <> lower(dom) then
    raise exception 'Only % email addresses can sign in', dom;
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          (case when exists (select 1 from public.profiles where role = 'admin') then 'viewer' else 'admin' end)::public.app_role);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger subjects_touch before update on public.subjects
  for each row execute function public.touch_updated_at();

-- Replace a subject's WK and/or SDG mappings in one step (used by the AI).
-- rows: [{"co_no":1,"kind":"WK","num":2,"level":3,"justification":"...","source":"ai"}, ...]
-- p_co_nos: only these COs are replaced (null = every CO of the subject).
-- Runs as the caller, so the access rules below still apply. All or nothing.
create function public.replace_mappings(p_subject_id bigint, p_kinds text[], p_rows jsonb, p_co_nos int[] default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare r jsonb; v_outcome bigint; n int := 0;
begin
  if not public.can_edit() then
    raise exception 'You do not have permission to edit mappings' using errcode = '42501';
  end if;
  delete from public.mappings m using public.outcomes o
   where m.outcome_id = o.id and o.subject_id = p_subject_id and m.kind = any (p_kinds)
     and (p_co_nos is null or o.co_no = any (p_co_nos));
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r ->> 'level')::int between 1 and 3 and (r ->> 'kind') = any (p_kinds)
       and (p_co_nos is null or (r ->> 'co_no')::int = any (p_co_nos)) then
      select id into v_outcome from public.outcomes
       where subject_id = p_subject_id and co_no = (r ->> 'co_no')::int;
      if v_outcome is null then
        raise exception 'CO% does not exist in this subject', r ->> 'co_no';
      end if;
      insert into public.mappings (outcome_id, kind, num, level, justification, source)
      values (v_outcome, r ->> 'kind', (r ->> 'num')::int, (r ->> 'level')::int,
              coalesce(r ->> 'justification', ''), coalesce(nullif(r ->> 'source', ''), 'ai'));
      n := n + 1;
    end if;
  end loop;
  update public.subjects set updated_at = now() where id = p_subject_id;
  return n;
end $$;

-- Bulk import of subjects and their COs (from Excel). Subjects are matched on (scheme, code).
-- For each subject in the file, its COs become exactly the COs in the file: matching CO numbers are
-- updated (their WK/SDG mappings are kept), new ones added, and ones missing from the file removed.
-- p_subjects: [{"scheme","semester","code","name","department",
--               "outcomes":[{"co_no","statement","k_level","title","topics"}]}]
create function public.import_subjects(p_subjects jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s jsonb; o jsonb; v_id bigint; v_new boolean; n_new int := 0; n_upd int := 0; n_cos int := 0; keep int[];
begin
  if not public.can_edit() then
    raise exception 'You do not have permission to import subjects' using errcode = '42501';
  end if;
  for s in select * from jsonb_array_elements(p_subjects) loop
    insert into public.subjects (scheme, semester, code, name, department)
    values (coalesce(s ->> 'scheme', ''), nullif(s ->> 'semester', '')::smallint, s ->> 'code', s ->> 'name',
            coalesce(s ->> 'department', ''))
    on conflict (scheme, code) do update
      set name       = excluded.name,
          semester   = coalesce(excluded.semester, public.subjects.semester),
          department = coalesce(nullif(excluded.department, ''), public.subjects.department)
    returning id, (xmax = 0) into v_id, v_new;
    if v_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;

    keep := array(select (x ->> 'co_no')::int from jsonb_array_elements(coalesce(s -> 'outcomes', '[]')) x);
    delete from public.outcomes where subject_id = v_id and co_no <> all (keep);
    for o in select * from jsonb_array_elements(coalesce(s -> 'outcomes', '[]')) loop
      insert into public.outcomes (subject_id, co_no, statement, k_level, title, topics)
      values (v_id, (o ->> 'co_no')::int, o ->> 'statement', nullif(o ->> 'k_level', ''),
              coalesce(o ->> 'title', ''), coalesce(o ->> 'topics', ''))
      on conflict (subject_id, co_no) do update
        set statement = excluded.statement,
            k_level   = coalesce(excluded.k_level, public.outcomes.k_level),
            title     = coalesce(nullif(excluded.title, ''), public.outcomes.title),
            topics    = coalesce(nullif(excluded.topics, ''), public.outcomes.topics);
      n_cos := n_cos + 1;
    end loop;
  end loop;
  return jsonb_build_object('created', n_new, 'updated', n_upd, 'outcomes', n_cos);
end $$;

-- ─────────────── 4. Access rules ───────────────
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.subjects enable row level security;
alter table public.outcomes enable row level security;
alter table public.mappings enable row level security;

create policy "profiles: read own or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "profiles: admin updates" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "settings: read" on public.settings for select to authenticated using (true);
create policy "settings: admin updates" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Everyone signed in can read; admins and editors can change.
create policy "subjects: read"  on public.subjects for select to authenticated using (true);
create policy "subjects: write" on public.subjects for all to authenticated
  using (public.can_edit()) with check (public.can_edit());
create policy "outcomes: read"  on public.outcomes for select to authenticated using (true);
create policy "outcomes: write" on public.outcomes for all to authenticated
  using (public.can_edit()) with check (public.can_edit());
create policy "mappings: read"  on public.mappings for select to authenticated using (true);
create policy "mappings: write" on public.mappings for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

-- ─────────────── 5. Privileges ───────────────
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, update                 on public.profiles, public.settings to authenticated;
grant select, insert, update, delete on public.subjects, public.outcomes, public.mappings to authenticated;
grant select                         on public.subject_summary to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_admin(), public.can_edit(),
                          public.replace_mappings(bigint, text[], jsonb, int[]),
                          public.import_subjects(jsonb) to authenticated;
revoke execute on function public.import_subjects(jsonb) from anon, public;
revoke execute on function public.replace_mappings(bigint, text[], jsonb, int[]) from anon, public;

-- ─────────────── 6. Keep existing accounts ───────────────
-- Recreate profiles for people who already signed in; the earliest becomes admin.
insert into public.profiles (id, email, role)
select u.id, u.email,
       (case when row_number() over (order by u.created_at) = 1 then 'admin' else 'viewer' end)::public.app_role
from auth.users u
where u.email is not null;
