-- A submitted application never goes back to the draft step because of Clarify.
--
-- Clarify's "Sign Up" maps to draft. Right after a Joey submits, the journey page can read
-- Clarify before the submit push has moved the record to Assignment, and that "Sign Up"
-- used to send the application back to draft ("Finish your application") until the next sync.
create or replace function public.apply_clarify_stage(p_joey uuid, p_clarify_value text, p_at timestamp with time zone default now())
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key text;
  v_current text;
  v_status public.application_status;
begin
  if nullif(trim(p_clarify_value), '') is null then return 'empty'; end if;

  select key into v_key from public.application_stages
   where exists (select 1 from unnest(clarify_values) v where lower(v) = lower(trim(p_clarify_value)))
   limit 1;
  if v_key is null then return 'unmapped'; end if;

  select stage_key, status into v_current, v_status
    from public.joey_applications where joey_id = p_joey for update;
  if not found then return 'no_application'; end if;
  if v_status = 'draft' then return 'still_draft'; end if;
  if v_key = 'draft' then return 'already_submitted'; end if;
  if v_current = v_key then return 'unchanged'; end if;

  update public.joey_applications
     set stage_key = v_key, stage_changed_at = coalesce(p_at, now())
   where joey_id = p_joey;
  insert into public.application_stage_events (joey_id, stage_key, occurred_at, source)
  values (p_joey, v_key, coalesce(p_at, now()), 'clarify');
  return 'updated';
end $$;

-- Repair applications this already happened to: back to the last stage they reached after draft.
update public.joey_applications a
   set stage_key = coalesce(
         (select e.stage_key from public.application_stage_events e
           where e.joey_id = a.joey_id and e.stage_key <> 'draft'
           order by e.occurred_at desc limit 1),
         'in_review'),
       stage_changed_at = coalesce(
         (select max(e.occurred_at) from public.application_stage_events e
           where e.joey_id = a.joey_id and e.stage_key <> 'draft'),
         a.submitted_at)
 where a.status = 'submitted' and a.stage_key = 'draft';
