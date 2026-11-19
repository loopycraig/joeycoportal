-- The journey follows the Joey Journey one-pager: Getting Started, Getting to Know You,
-- Joining the Joey Community, Matching with Your Host, Signing Agreements and Forms,
-- Preparing for Move-In, Moving In.
--
-- A stage is where an application is; a step is what the journey bar shows. Some steps hold
-- more than one stage (Getting Started: draft, then submitted; Matching: meeting Hosts, then
-- the background check). Stage keys are unchanged, so existing applications keep their place.
--
-- Where each stage comes from:
--   draft, in_review, reference_check, approved, matched, on_hold, not_moving_forward
--       Clarify's vetting stage (clarify_values), as before.
--   matching, background_check
--       While the vetting stage is Match Ready: the Joey's Match Attempts and background check
--       status in Clarify (lib/clarify/sync.ts), set with set_match_ready_stage().
--   signing, move_in_prep, and matched once a portal match exists
--       Worked out from the portal match and its agreements when the page loads (lib/joey/journey.ts).

alter table public.application_stages add column if not exists step text;

insert into public.application_stages
  (key, sort_order, step, title, owner, owner_label, joey_message, typical_duration, clarify_values, on_path, joey_can_edit_references)
values
  ('draft', 10, 'Getting Started', 'Apply to JoeyCo', 'joey', 'You',
   'Your answers save as you go. Submit once every section is complete, including your signature on the JoeyCo Code of Conduct.',
   null, '{Sign Up}', true, true),
  ('in_review', 20, 'Getting Started', 'Application submitted', 'joeyco', 'JoeyCo',
   'Thanks for applying! Next, we''ll reach out to set up a 20-minute intro call, where you''ll learn more about JoeyCo and how we work.',
   '3–5 business days', '{Assignment,"Scheduling + Intro Call"}', true, true),
  ('reference_check', 30, 'Getting to Know You', 'Getting to know you', 'joeyco', 'You and the JoeyCo team',
   'You''ll meet two members of our team for virtual conversations about you, your financial goals, and your preferences, then one of us in person. We''ll also talk with your references and share a draft Joey Financial Estimate for you to review.',
   'About 2 weeks', '{Screening}', true, false),
  ('approved', 40, 'Joining the Joey Community', 'Joining the Joey Community', 'joeyco', 'JoeyCo',
   'You''re in! Our team is looking for a current opportunity that fits you, and we''ll share any potential matches with you.',
   'Varies by city', '{"Match Ready"}', true, false),
  ('matching', 50, 'Matching with Your Host', 'Meeting your Host', 'host', 'You, your Host, and JoeyCo',
   'You and a Host are both interested in connecting. We''ll set up a virtual meeting with you both and a member of our team, then an in-person meeting if you both want to move forward.',
   null, '{}', true, false),
  ('background_check', 55, 'Matching with Your Host', 'Background check', 'vendor', 'You, then our screening partner',
   'You and your Host want to move forward, so we''re running your background check. Watch your inbox for an email from our screening partner asking for your consent. You complete that step on their site, and the results come back to JoeyCo.',
   '2–5 business days after you consent', '{}', true, false),
  ('signing', 60, 'Signing Agreements and Forms', 'Signing agreements and forms', 'joey', 'You and your Host',
   'Review and sign your Housing License and Employment Offer from your Host in Agreements. We''ll also go over your final Joey Financial Estimate, confirm you can pay first month''s rent and any security deposit, and share a draft of the House Manual.',
   null, '{}', true, false),
  ('move_in_prep', 70, 'Preparing for Move-In', 'Preparing for move-in', 'joey', 'You, your Host, and JoeyCo',
   'Complete Joey 101 training with our team, finish any payroll paperwork from your Host, finalize the House Manual together, and set your weekly schedule.',
   null, '{}', true, false),
  ('matched', 80, 'Moving In', 'Moving in', 'host', 'You and your Host',
   'Welcome home! You''ll meet weekly with your Host for Look-Ahead meetings, pay rent monthly, and get paid every other week. JoeyCo will check in as you settle in and ask for your feedback each month.',
   null, '{Matched,Completed}', true, false)
on conflict (key) do update set
  sort_order = excluded.sort_order,
  step = excluded.step,
  title = excluded.title,
  owner = excluded.owner,
  owner_label = excluded.owner_label,
  joey_message = excluded.joey_message,
  typical_duration = excluded.typical_duration,
  clarify_values = excluded.clarify_values,
  on_path = excluded.on_path,
  joey_can_edit_references = excluded.joey_can_edit_references;

-- Clarify's Match Ready covers three portal stages: approved, matching and background_check.
-- The vetting stage alone never moves a Joey back from matching or background_check to approved;
-- set_match_ready_stage() does, from the Match Attempts.
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
  if v_key = 'approved' and v_current in ('matching', 'background_check') then return 'unchanged'; end if;

  update public.joey_applications
     set stage_key = v_key, stage_changed_at = coalesce(p_at, now())
   where joey_id = p_joey;
  insert into public.application_stage_events (joey_id, stage_key, occurred_at, source)
  values (p_joey, v_key, coalesce(p_at, now()), 'clarify');
  return 'updated';
end $$;

-- Moves a Match Ready Joey between approved, matching and background_check. Service role only.
create or replace function public.set_match_ready_stage(p_joey uuid, p_key text, p_at timestamp with time zone default now())
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current text;
begin
  if p_key not in ('approved', 'matching', 'background_check') then raise exception 'Not a Match Ready stage: %', p_key; end if;
  select stage_key into v_current from public.joey_applications where joey_id = p_joey for update;
  if not found then return 'no_application'; end if;
  if v_current not in ('approved', 'matching', 'background_check') then return 'not_match_ready'; end if;
  if v_current = p_key then return 'unchanged'; end if;

  update public.joey_applications
     set stage_key = p_key, stage_changed_at = coalesce(p_at, now())
   where joey_id = p_joey;
  insert into public.application_stage_events (joey_id, stage_key, occurred_at, source)
  values (p_joey, p_key, coalesce(p_at, now()), 'clarify');
  return 'updated';
end $$;

revoke all on function public.set_match_ready_stage(uuid, text, timestamp with time zone) from public, anon, authenticated;

-- The Clarify deal stage of each match (Contracting or Matched), kept current by the deal sync.
-- With no agreements in the portal, Contracting means the Joey is signing; anything else means the
-- pair signed outside the portal and has moved in.
alter table public.matches add column if not exists clarify_deal_stage text;
