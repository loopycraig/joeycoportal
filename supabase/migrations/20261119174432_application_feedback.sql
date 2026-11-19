-- Application changes from team feedback (Nov 19):
--  * Work authorization can be "Other", with an explanation.
--  * Move-in is an earliest date instead of a range, so the team can see who becomes
--    available when. move_in_timing stays for older applications; the portal works out
--    Clarify's Move-in timeline from the date when it sends it.
--  * References: one each from school or community (Institutional), work (Professional),
--    and someone they've lived with (Landlord or Housemate), as on the Joey Journey one-pager.

alter table public.joey_applications
  add column if not exists work_auth_explanation text,
  add column if not exists move_in_date date;

-- Keys and order match missingFields() in lib/joey/application.ts.
create or replace function public.application_missing(p_joey uuid)
returns text[]
language sql
stable security definer
set search_path to 'public'
as $$
  select array_remove(array[
    case when nullif(trim(a.first_name), '') is null then 'first_name' end,
    case when nullif(trim(a.last_name), '') is null then 'last_name' end,
    case when length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) < 10 then 'phone' end,
    case when a.date_of_birth is null then 'date_of_birth'
         when a.date_of_birth > (current_date - interval '18 years')::date then 'under_18' end,
    case when nullif(trim(a.work_authorized), '') is null then 'work_authorized' end,
    case when a.work_authorized = 'Other' and nullif(trim(a.work_auth_explanation), '') is null then 'work_auth_explanation' end,
    case when nullif(trim(a.school_degree), '') is null then 'school_degree' end,
    case when nullif(trim(a.host_preference), '') is null then 'host_preference' end,
    case when cardinality(a.preferred_cities) = 0 then 'preferred_cities' end,
    case when a.move_in_date is null then 'move_in_date' end,
    case when cardinality(a.services) = 0 then 'services' end,
    case when nullif(trim(a.why_joey), '') is null then 'why_joey' end,
    case when nullif(trim(a.heard_about), '') is null then 'heard_about' end,
    case when nullif(trim(a.conduct_signature), '') is null then 'conduct_signature' end,
    case when a.news_opt_in is null then 'news_opt_in' end,
    case when not exists (select 1 from public.joey_references r where r.joey_id = a.joey_id
                          and r.reference_type = 'Institutional') then 'reference_school' end,
    case when not exists (select 1 from public.joey_references r where r.joey_id = a.joey_id
                          and r.reference_type = 'Professional') then 'reference_work' end,
    case when not exists (select 1 from public.joey_references r where r.joey_id = a.joey_id
                          and r.reference_type in ('Landlord', 'Housemate')) then 'reference_home' end
  ], null)
  from public.joey_applications a
  where a.joey_id = p_joey
$$;
