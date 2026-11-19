-- Update 3: PO and PSO mappings, and the programme's PSO statements in Settings.
-- Run ONCE in Supabase → SQL Editor (keeps all your data).

-- 1. Let mappings hold PO1–PO11 and PSO1–PSO3 as well as WK and SDG.
alter table public.mappings drop constraint if exists mappings_kind_check;
alter table public.mappings drop constraint if exists mappings_check;
alter table public.mappings drop constraint if exists mappings_num_check;
alter table public.mappings add constraint mappings_kind_check check (kind in ('WK', 'SDG', 'PO', 'PSO'));
alter table public.mappings add constraint mappings_num_check check (
  (kind = 'WK'  and num between 1 and 9)  or (kind = 'SDG' and num between 1 and 17) or
  (kind = 'PO'  and num between 1 and 11) or (kind = 'PSO' and num between 1 and 3));

-- 2. PSO statements (editable in Settings). Pre-filled with the ECE PSOs if none are set.
alter table public.settings add column if not exists psos jsonb not null default '[]';
update public.settings set psos = '["Demonstrate their skills in designing, implementing and testing analogue and digital electronic circuits, including microprocessor systems, for signal processing, communication, networking, VLSI and embedded systems applications.", "Apply their knowledge and skills to conduct experiments and develop applications using electronic design automation (EDA) tools.", "Demonstrate a sense of professional ethics, recognize the importance of continued learning, and be able to carry out their professional and entrepreneurial responsibilities in electronics engineering field giving due consideration to environment protection and sustainability."]' where psos = '[]'::jsonb;

-- 3. Subject list counts now include PO and PSO.
drop view if exists public.subject_summary;
create view public.subject_summary with (security_invoker = true) as
select s.id, s.scheme, s.semester, s.code, s.name, s.department, s.updated_at,
       (select count(*) from public.outcomes o where o.subject_id = s.id)::int as co_count,
       (select count(*) from public.mappings m join public.outcomes o on o.id = m.outcome_id
         where o.subject_id = s.id and m.kind = 'WK')::int  as wk_count,
       (select count(*) from public.mappings m join public.outcomes o on o.id = m.outcome_id
         where o.subject_id = s.id and m.kind = 'SDG')::int as sdg_count,
       (select count(*) from public.mappings m join public.outcomes o on o.id = m.outcome_id
         where o.subject_id = s.id and m.kind = 'PO')::int  as po_count,
       (select count(*) from public.mappings m join public.outcomes o on o.id = m.outcome_id
         where o.subject_id = s.id and m.kind = 'PSO')::int as pso_count
from public.subjects s;
grant select on public.subject_summary to authenticated;
