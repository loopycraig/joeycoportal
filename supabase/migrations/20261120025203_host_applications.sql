-- Host sign-up: the questions from the "Is Hosting a Joey right for me?" Tally form, asked in the
-- portal and sent to Clarify the same way (a c_host record at Assignment, like api/host-apply.js).
-- Mirrors the Joey application: a draft that saves as you go, a submit, and a journey of stages
-- that follows the c_host record's stage in Clarify.
--
-- Hosts who already have a match (made from a Clarify deal) never see this: the portal only shows
-- the application to Hosts without one (lib/host/queries.ts).

create table if not exists public.host_application_stages (
  key text primary key,
  sort_order integer not null,
  step text,
  title text not null,
  host_message text not null,
  owner_label text not null,
  typical_duration text,
  clarify_values text[] not null default '{}',
  on_path boolean not null default true
);

alter table public.host_application_stages enable row level security;
create policy "anyone signed in reads host stages" on public.host_application_stages
  for select to authenticated using (true);
grant select on table public.host_application_stages to authenticated;
grant all on table public.host_application_stages to service_role;

-- Clarify c_host stages: Assignment, Sales & Discovery, Intake, Search, Contracting, Matched,
-- Completed, New Area Requests, On Hold, Refunded, Rejected, Inactive.
-- TODO: have the team review the Host-facing wording.
insert into public.host_application_stages
  (key, sort_order, step, title, owner_label, host_message, typical_duration, clarify_values, on_path)
values
  ('draft', 10, 'Getting Started', 'Tell us about your home', 'You',
   'A few short questions about the help you''re looking for and your home. Your answers save as you go.',
   null, '{}', true),
  ('in_review', 20, 'Getting Started', 'Thanks for reaching out', 'JoeyCo',
   'We''ll call you soon to say hello, answer your questions, and learn a little more about what you need.',
   null, '{Assignment}', true),
  ('discovery', 30, 'Getting to Know You', 'Getting to know you', 'You and the JoeyCo team',
   'We''re talking with you about the help you''d like, how a Joey would fit into your week, and your home.',
   null, '{"Sales & Discovery",Intake}', true),
  ('search', 40, 'Finding Your Joey', 'Finding your Joey', 'JoeyCo',
   'We''re looking for a Joey who fits your home and the help you need. We''ll introduce you before anything is decided.',
   'Varies by city', '{Search}', true),
  ('contracting', 50, 'Signing Agreements', 'Signing agreements', 'You and your Joey',
   'You and your Joey are ready to move forward. Your agreements are ready to review and sign in the portal.',
   null, '{Contracting}', true),
  ('matched', 60, 'Living with Your Joey', 'Living with your Joey', 'You and your Joey',
   'Welcome your Joey home! Timecards, payments, and agreements are all in your portal.',
   null, '{Matched,Completed}', true),
  ('on_hold', 90, null, 'Paused for now', 'JoeyCo',
   'We''ve paused things for now. We''ll be in touch when we''re ready to pick back up.',
   null, '{"New Area Requests","On Hold",Inactive}', false),
  ('closed', 95, null, 'Closed', 'JoeyCo',
   'We''re not able to move forward right now. Please reach out if you have any questions.',
   null, '{Rejected,Refunded}', false)
on conflict (key) do update set
  sort_order = excluded.sort_order,
  step = excluded.step,
  title = excluded.title,
  owner_label = excluded.owner_label,
  host_message = excluded.host_message,
  typical_duration = excluded.typical_duration,
  clarify_values = excluded.clarify_values,
  on_path = excluded.on_path;

create table if not exists public.host_applications (
  host_id uuid primary key references public.profiles(id) on delete cascade,
  full_name text,
  zip_code text,
  phone text,
  -- Values match c_host.type_of_help_needed: Household tasks, Driving, Running errands, Pet care,
  -- Childcare, Medical care/assistance, Other.
  help_types text[] not null default '{}',
  -- c_host.childcare_needs: "Pickups, drop-offs, date nights", Part-time, Full-time. Asked with Childcare.
  childcare_need text,
  -- Asked with Medical care/assistance.
  medical_needs text,
  -- Asked with Other ("Tell us more! What sort of help do you need?").
  help_details text,
  -- c_host.weekly_hours_needed: Less than 5 hours, 5–10 hours, 10–15 hours, 15+ hours.
  weekly_hours text,
  -- c_host.amenities: Private bedroom, Bathroom access, Kitchen access, WiFi. Can be empty.
  amenities text[] not null default '{}',
  status public.application_status not null default 'draft',
  submitted_at timestamptz,
  stage_key text not null default 'draft' references public.host_application_stages(key),
  stage_changed_at timestamptz not null default now(),
  clarify_host_id text unique,
  clarify_sync_requested_at timestamptz,
  clarify_synced_at timestamptz,
  clarify_sync_error text,
  clarify_stage_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists host_applications_clarify_sync_requested_at_idx
  on public.host_applications (clarify_sync_requested_at) where clarify_sync_requested_at is not null;

create table if not exists public.host_application_stage_events (
  id bigint generated always as identity primary key,
  host_id uuid not null references public.host_applications(host_id) on delete cascade,
  stage_key text not null references public.host_application_stages(key),
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('portal', 'clarify'))
);

create index if not exists host_application_stage_events_host_idx
  on public.host_application_stage_events (host_id, occurred_at);

create or replace function public.host_applications_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace trigger host_applications_before_update
  before update on public.host_applications
  for each row execute function public.host_applications_before_update();

alter table public.host_applications enable row level security;
alter table public.host_application_stage_events enable row level security;

create policy "host reads own application" on public.host_applications
  for select using (host_id = auth.uid());
create policy "host edits own draft" on public.host_applications
  for update using (host_id = auth.uid() and status = 'draft')
  with check (host_id = auth.uid() and status = 'draft');
create policy "host reads own stage history" on public.host_application_stage_events
  for select using (host_id = auth.uid());

grant select on table public.host_applications to authenticated;
grant update (full_name, zip_code, phone, help_types, childcare_need, medical_needs, help_details, weekly_hours, amenities)
  on table public.host_applications to authenticated;
grant all on table public.host_applications to service_role;
grant select on table public.host_application_stage_events to authenticated;
grant all on table public.host_application_stage_events to service_role;

-- The signed-in Host's application, made on first visit with the name from their profile.
create or replace function public.ensure_my_host_application()
returns public.host_applications
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.host_applications;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if (select role from public.profiles where id = v_uid) is distinct from 'host' then
    raise exception 'Only Hosts have a host application.';
  end if;

  select * into v_row from public.host_applications where host_id = v_uid;
  if found then return v_row; end if;

  insert into public.host_applications (host_id, full_name)
  values (v_uid, (select nullif(trim(full_name), '') from public.profiles where id = v_uid))
  on conflict (host_id) do nothing;

  insert into public.host_application_stage_events (host_id, stage_key, source)
  select v_uid, 'draft', 'portal'
  where not exists (select 1 from public.host_application_stage_events where host_id = v_uid);

  select * into v_row from public.host_applications where host_id = v_uid;
  return v_row;
end $$;

revoke all on function public.ensure_my_host_application() from public;
grant execute on function public.ensure_my_host_application() to authenticated, service_role;

-- Keys and order match hostMissingFields() in lib/host/application.ts.
create or replace function public.host_application_missing(p_host uuid)
returns text[]
language sql
stable security definer
set search_path to 'public'
as $$
  select array_remove(array[
    case when nullif(trim(a.full_name), '') is null then 'full_name' end,
    case when coalesce(a.zip_code, '') !~ '^\d{5}$' then 'zip_code' end,
    case when length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) < 10 then 'phone' end,
    case when cardinality(a.help_types) = 0 then 'help_types' end,
    case when 'Childcare' = any (a.help_types) and nullif(trim(a.childcare_need), '') is null then 'childcare_need' end,
    case when 'Medical care/assistance' = any (a.help_types) and nullif(trim(a.medical_needs), '') is null then 'medical_needs' end,
    case when 'Other' = any (a.help_types) and nullif(trim(a.help_details), '') is null then 'help_details' end,
    case when nullif(trim(a.weekly_hours), '') is null then 'weekly_hours' end
  ], null)
  from public.host_applications a
  where a.host_id = p_host
$$;

revoke all on function public.host_application_missing(uuid) from public, anon, authenticated;
grant execute on function public.host_application_missing(uuid) to service_role;

create or replace function public.submit_my_host_application()
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.application_status;
  v_missing text[];
begin
  select status into v_status from public.host_applications where host_id = v_uid for update;
  if not found then raise exception 'No application found.'; end if;
  if v_status = 'submitted' then return '{}'; end if;

  v_missing := public.host_application_missing(v_uid);
  if cardinality(v_missing) > 0 then return v_missing; end if;

  update public.host_applications
     set status = 'submitted',
         submitted_at = now(),
         stage_key = 'in_review',
         stage_changed_at = now(),
         clarify_sync_requested_at = now()
   where host_id = v_uid;

  insert into public.host_application_stage_events (host_id, stage_key, source)
  values (v_uid, 'in_review', 'portal');
  return '{}';
end $$;

revoke all on function public.submit_my_host_application() from public;
grant execute on function public.submit_my_host_application() to authenticated, service_role;

-- Applies a c_host stage from Clarify. Service role only. A submitted application never goes back to draft.
create or replace function public.apply_clarify_host_stage(p_host uuid, p_clarify_value text, p_at timestamptz default now())
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

  select key into v_key from public.host_application_stages
   where exists (select 1 from unnest(clarify_values) v where lower(v) = lower(trim(p_clarify_value)))
   limit 1;
  if v_key is null then return 'unmapped'; end if;

  select stage_key, status into v_current, v_status
    from public.host_applications where host_id = p_host for update;
  if not found then return 'no_application'; end if;
  if v_status = 'draft' then return 'still_draft'; end if;
  if v_current = v_key then return 'unchanged'; end if;

  update public.host_applications
     set stage_key = v_key, stage_changed_at = coalesce(p_at, now())
   where host_id = p_host;
  insert into public.host_application_stage_events (host_id, stage_key, occurred_at, source)
  values (p_host, v_key, coalesce(p_at, now()), 'clarify');
  return 'updated';
end $$;

revoke all on function public.apply_clarify_host_stage(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_clarify_host_stage(uuid, text, timestamptz) to service_role;
