-- Agreements: documents Hosts and Joeys review and sign in the portal.
--   offer_letter     Host ↔ Joey   (Employment Offer Letter)
--   housing_license  Host ↔ Joey   (Joey Housing License Agreement, CA)
--   host_services    JoeyCo ↔ Host (Host Services Agreement; JoeyCo countersigns automatically)
--
-- Document text lives in code (lib/agreements/templates). Every version a Joey can see is frozen
-- here as rendered blocks plus their SHA-256, and a signature is only accepted against the current
-- version's hash, so each signature is tied to the exact text the signer saw.
--
-- Users can read their own rows (RLS). There are no direct writes: every change goes through the
-- agreement_* functions below, which only the service role can call. Server actions
-- (lib/agreements/actions.ts) check the session, render and hash the document, then call them.

create type public.agreement_kind as enum ('offer_letter', 'housing_license', 'host_services');
create type public.agreement_status as enum (
  'draft',                 -- Host is filling it in
  'sent',                  -- with the Joey to review
  'changes_requested',     -- Joey asked for changes; back with the Host
  'awaiting_countersign',  -- Joey signed; Host signs next
  'executed',              -- signed by everyone
  'void'                   -- withdrawn before it was executed
);
create type public.agreement_party as enum ('joey', 'host', 'joeyco');

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  kind public.agreement_kind not null,
  host_id uuid not null references public.profiles(id),
  joey_id uuid references public.profiles(id),
  match_id uuid references public.matches(id),
  status public.agreement_status not null default 'draft',
  draft_fields jsonb not null default '{}'::jsonb,  -- the Host's work in progress; not shown to the Joey
  current_version integer not null default 0,       -- 0 until first sent (or signed, for the HSA)
  ends_on date,                                     -- fixed-term housing license end date
  replaces_id uuid references public.agreements(id),
  provider text not null default 'portal' check (provider in ('portal', 'pandadoc')),
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  executed_at timestamptz,
  voided_at timestamptz,
  constraint agreements_parties check (
    (kind = 'host_services' and joey_id is null and match_id is null)
    or (kind <> 'host_services' and joey_id is not null and match_id is not null)
  )
);
create index agreements_host_idx on public.agreements (host_id);
create index agreements_joey_idx on public.agreements (joey_id);
create index agreements_match_idx on public.agreements (match_id);
-- One HSA per Host that isn't void.
create unique index agreements_one_hsa on public.agreements (host_id)
  where kind = 'host_services' and status <> 'void';

create table public.agreement_versions (
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  version integer not null,
  template_version text not null,
  fields jsonb not null,
  rendered jsonb not null,
  content_hash text not null,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (agreement_id, version)
);

create table public.agreement_signatures (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  version integer not null,
  party public.agreement_party not null,
  signer_id uuid references public.profiles(id),  -- null for JoeyCo's automatic countersignature
  typed_name text not null,
  signer_title text,
  content_hash text not null,
  addendum_ack boolean,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  foreign key (agreement_id, version) references public.agreement_versions (agreement_id, version),
  unique (agreement_id, version, party)
);

create table public.agreement_events (
  id bigint generated always as identity primary key,
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  version integer,
  actor_id uuid references public.profiles(id),
  action text not null check (action in (
    'created', 'sent', 'viewed', 'changes_requested', 'signed', 'countersigned', 'voided', 'executed'
  )),
  comment text,
  ip text,
  user_agent text,
  at timestamptz not null default now()
);
create index agreement_events_agreement_idx on public.agreement_events (agreement_id, at);

create table public.esign_consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  ip text,
  user_agent text,
  unique (profile_id, consent_version)
);

-- ─────────────────────────────────────────────
-- Read access
-- ─────────────────────────────────────────────

-- Hosts see their agreements; Joeys see theirs once sent.
create or replace function public.can_see_agreement(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agreements a
     where a.id = p_id
       and (a.host_id = auth.uid() or (a.joey_id = auth.uid() and a.current_version > 0))
  )
$$;

alter table public.agreements enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.agreement_signatures enable row level security;
alter table public.agreement_events enable row level security;
alter table public.esign_consents enable row level security;

create policy "parties read agreements" on public.agreements for select to authenticated
  using (public.can_see_agreement(id));
create policy "parties read versions" on public.agreement_versions for select to authenticated
  using (public.can_see_agreement(agreement_id));
create policy "parties read signatures" on public.agreement_signatures for select to authenticated
  using (public.can_see_agreement(agreement_id));
create policy "parties read events" on public.agreement_events for select to authenticated
  using (public.can_see_agreement(agreement_id));
create policy "read own consents" on public.esign_consents for select to authenticated
  using (profile_id = auth.uid());

revoke all on public.agreements, public.agreement_versions, public.agreement_signatures,
  public.agreement_events, public.esign_consents from anon, authenticated;
grant select on public.agreements, public.agreement_versions, public.agreement_signatures,
  public.agreement_events, public.esign_consents to authenticated;

-- ─────────────────────────────────────────────
-- Changes (service role only; called from lib/agreements/actions.ts)
-- ─────────────────────────────────────────────

create or replace function public.agreement_log(
  p_id uuid, p_version integer, p_actor uuid, p_action text, p_comment text, p_ip text, p_ua text
) returns void language sql security definer set search_path = public as $$
  insert into public.agreement_events (agreement_id, version, actor_id, action, comment, ip, user_agent)
  values (p_id, p_version, p_actor, p_action, nullif(trim(p_comment), ''), p_ip, p_ua)
$$;

-- A Host starts an agreement: the HSA for themself, or an offer letter / housing license for an active match.
create or replace function public.agreement_create(
  p_actor uuid, p_kind public.agreement_kind, p_match uuid, p_fields jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_joey uuid;
  v_id uuid;
begin
  if (select role from public.profiles where id = p_actor) is distinct from 'host' then
    raise exception 'Only Hosts can start agreements';
  end if;

  if p_kind = 'host_services' then
    select id into v_id from public.agreements
     where host_id = p_actor and kind = 'host_services' and status <> 'void';
    if v_id is not null then return v_id; end if;
  else
    select joey_id into v_joey from public.matches
     where id = p_match and host_id = p_actor and ended_at is null;
    if v_joey is null then raise exception 'That Joey isn''t one of your active matches'; end if;
  end if;

  insert into public.agreements (kind, host_id, joey_id, match_id, draft_fields)
  values (p_kind, p_actor, v_joey, case when p_kind = 'host_services' then null else p_match end,
          coalesce(p_fields, '{}'::jsonb))
  returning id into v_id;
  perform public.agreement_log(v_id, null, p_actor, 'created', null, null, null);
  return v_id;
end $$;

create or replace function public.agreement_save_draft(p_actor uuid, p_id uuid, p_fields jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.agreements set draft_fields = p_fields, updated_at = now()
   where id = p_id and host_id = p_actor and status in ('draft', 'changes_requested', 'sent');
  if not found then raise exception 'This agreement can''t be edited now'; end if;
end $$;

-- Host sends (or resends) to the Joey: freezes a new version.
create or replace function public.agreement_send(
  p_actor uuid, p_id uuid, p_fields jsonb, p_rendered jsonb, p_hash text, p_template_version text,
  p_ends_on date, p_note text, p_ip text, p_ua text
) returns integer language plpgsql security definer set search_path = public as $$
declare
  a public.agreements;
  v_version integer;
begin
  select * into a from public.agreements where id = p_id for update;
  if not found or a.host_id <> p_actor then raise exception 'Agreement not found'; end if;
  if a.kind = 'host_services' then raise exception 'The Host Services Agreement is signed, not sent'; end if;
  if a.status not in ('draft', 'sent', 'changes_requested') then
    raise exception 'This agreement can''t be sent now';
  end if;
  if not exists (select 1 from public.matches where id = a.match_id and ended_at is null) then
    raise exception 'This match has ended';
  end if;

  v_version := a.current_version + 1;
  insert into public.agreement_versions (agreement_id, version, template_version, fields, rendered, content_hash, note, created_by)
  values (p_id, v_version, p_template_version, p_fields, p_rendered, p_hash, nullif(trim(p_note), ''), p_actor);

  update public.agreements
     set status = 'sent', current_version = v_version, draft_fields = p_fields, ends_on = p_ends_on,
         sent_at = now(), updated_at = now()
   where id = p_id;
  perform public.agreement_log(p_id, v_version, p_actor, 'sent', p_note, p_ip, p_ua);
  return v_version;
end $$;

create or replace function public.agreement_mark_viewed(p_actor uuid, p_id uuid, p_ip text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_id;
  if not found or a.joey_id is distinct from p_actor or a.current_version = 0 then return; end if;
  -- One "viewed" per version is enough for the audit trail.
  if not exists (select 1 from public.agreement_events
                  where agreement_id = p_id and version = a.current_version and action = 'viewed' and actor_id = p_actor) then
    perform public.agreement_log(p_id, a.current_version, p_actor, 'viewed', null, p_ip, p_ua);
  end if;
end $$;

create or replace function public.agreement_request_changes(
  p_actor uuid, p_id uuid, p_comment text, p_ip text, p_ua text
) returns void language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  if nullif(trim(p_comment), '') is null then raise exception 'Say what you''d like changed'; end if;
  select * into a from public.agreements where id = p_id for update;
  if not found or a.joey_id is distinct from p_actor then raise exception 'Agreement not found'; end if;
  if a.status <> 'sent' then raise exception 'Changes can only be requested while you''re reviewing'; end if;
  update public.agreements set status = 'changes_requested', updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, a.current_version, p_actor, 'changes_requested', p_comment, p_ip, p_ua);
end $$;

create or replace function public.agreement_void(p_actor uuid, p_id uuid, p_comment text, p_ip text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_id for update;
  if not found or a.host_id <> p_actor then raise exception 'Agreement not found'; end if;
  if a.status in ('executed', 'void') then raise exception 'This agreement can''t be withdrawn'; end if;
  update public.agreements set status = 'void', voided_at = now(), updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, nullif(a.current_version, 0), p_actor, 'voided', p_comment, p_ip, p_ua);
end $$;

-- When both of a match's Joey agreements are executed, their pay and rent become the match's
-- accepted terms (what payroll uses). Skipped when rent isn't a dollar amount.
create or replace function public.agreement_record_terms(p_match uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  v_offer jsonb;
  v_license jsonb;
  v_start date;
  v_hourly integer;
  v_rent integer;
  v_lock date;
begin
  select * into m from public.matches where id = p_match and ended_at is null;
  if not found then return 'match_ended'; end if;

  select v.fields into v_offer from public.agreements a
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.match_id = p_match and a.kind = 'offer_letter' and a.status = 'executed'
   order by a.executed_at desc limit 1;
  select v.fields into v_license from public.agreements a
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.match_id = p_match and a.kind = 'housing_license' and a.status = 'executed'
   order by a.executed_at desc limit 1;
  if v_offer is null or v_license is null then return 'waiting'; end if;

  v_start := nullif(v_offer->>'start_date', '')::date;
  v_hourly := nullif(v_offer->>'hourly_rate_cents', '')::integer;
  v_rent := case when v_license->>'rent_mode' = 'amount' then nullif(v_license->>'rent_cents', '')::integer end;
  if v_start is null or v_hourly is null or v_rent is null then return 'not_numeric'; end if;

  v_lock := public.match_locked_through(p_match);
  if v_lock is not null and v_start <= v_lock then v_start := v_lock + 1; end if;

  update public.match_terms set status = 'superseded'
   where match_id = p_match and status = 'accepted' and effective_date = v_start;
  insert into public.match_terms
    (match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, note,
     proposed_by, proposed_at, responded_by, responded_at)
  values
    (p_match, v_start, v_hourly, v_rent, 'accepted', 'From the signed offer letter and housing license',
     m.host_id, now(), m.joey_id, now());
  return 'recorded';
end $$;

-- Signing. The Joey signs first (sent → awaiting_countersign), then the Host (→ executed).
-- p_hash must match the current version, so the signer saw exactly what's stored.
create or replace function public.agreement_sign(
  p_actor uuid, p_id uuid, p_version integer, p_hash text, p_typed_name text, p_addendum_ack boolean,
  p_ip text, p_ua text
) returns text language plpgsql security definer set search_path = public as $$
declare
  a public.agreements;
  v public.agreement_versions;
  v_party public.agreement_party;
begin
  if length(trim(coalesce(p_typed_name, ''))) < 2 then raise exception 'Type your full name to sign'; end if;
  select * into a from public.agreements where id = p_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if a.kind = 'host_services' then raise exception 'Use the Host Services Agreement signing step'; end if;
  if p_version <> a.current_version then
    raise exception 'This agreement has changed since you opened it. Review the latest version and sign again.';
  end if;
  select * into v from public.agreement_versions where agreement_id = p_id and version = p_version;
  if v.content_hash <> p_hash then
    raise exception 'This agreement has changed since you opened it. Review the latest version and sign again.';
  end if;
  if not exists (select 1 from public.esign_consents where profile_id = p_actor) then
    raise exception 'Agree to sign electronically first';
  end if;

  if a.joey_id = p_actor and a.status = 'sent' then
    v_party := 'joey';
    if a.kind = 'housing_license' and p_addendum_ack is not true then
      raise exception 'Acknowledge the AB 1482 addendum to sign';
    end if;
  elsif a.host_id = p_actor and a.status = 'awaiting_countersign' then
    v_party := 'host';
  else
    raise exception 'This agreement isn''t waiting for your signature';
  end if;

  insert into public.agreement_signatures
    (agreement_id, version, party, signer_id, typed_name, content_hash, addendum_ack, ip, user_agent)
  values (p_id, p_version, v_party, p_actor, trim(p_typed_name), p_hash, p_addendum_ack, p_ip, p_ua);

  if v_party = 'joey' then
    update public.agreements set status = 'awaiting_countersign', updated_at = now() where id = p_id;
    perform public.agreement_log(p_id, p_version, p_actor, 'signed', null, p_ip, p_ua);
    return 'awaiting_countersign';
  end if;

  update public.agreements set status = 'executed', executed_at = now(), updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, p_version, p_actor, 'countersigned', null, p_ip, p_ua);
  perform public.agreement_log(p_id, p_version, null, 'executed', null, null, null);
  perform public.agreement_record_terms(a.match_id);
  return 'executed';
end $$;

-- The HSA: the Host fills it in and signs; JoeyCo's signature is added for its configured signer.
create or replace function public.agreement_sign_host_services(
  p_actor uuid, p_id uuid, p_fields jsonb, p_rendered jsonb, p_hash text, p_template_version text,
  p_typed_name text, p_joeyco_name text, p_joeyco_title text, p_ip text, p_ua text
) returns text language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  if length(trim(coalesce(p_typed_name, ''))) < 2 then raise exception 'Type your full name to sign'; end if;
  select * into a from public.agreements where id = p_id for update;
  if not found or a.host_id <> p_actor or a.kind <> 'host_services' then raise exception 'Agreement not found'; end if;
  if a.status <> 'draft' then raise exception 'This agreement is already signed'; end if;
  if not exists (select 1 from public.esign_consents where profile_id = p_actor) then
    raise exception 'Agree to sign electronically first';
  end if;

  insert into public.agreement_versions (agreement_id, version, template_version, fields, rendered, content_hash, created_by)
  values (p_id, 1, p_template_version, p_fields, p_rendered, p_hash, p_actor);
  insert into public.agreement_signatures (agreement_id, version, party, signer_id, typed_name, content_hash, ip, user_agent)
  values (p_id, 1, 'host', p_actor, trim(p_typed_name), p_hash, p_ip, p_ua);
  insert into public.agreement_signatures (agreement_id, version, party, signer_id, typed_name, signer_title, content_hash)
  values (p_id, 1, 'joeyco', null, p_joeyco_name, p_joeyco_title, p_hash);

  update public.agreements
     set status = 'executed', current_version = 1, draft_fields = p_fields, executed_at = now(), updated_at = now()
   where id = p_id;
  perform public.agreement_log(p_id, 1, p_actor, 'signed', null, p_ip, p_ua);
  perform public.agreement_log(p_id, 1, null, 'countersigned', 'JoeyCo, signed automatically for ' || p_joeyco_name, null, null);
  perform public.agreement_log(p_id, 1, null, 'executed', null, null, null);
  return 'executed';
end $$;

create or replace function public.give_esign_consent(p_actor uuid, p_version text, p_ip text, p_ua text)
returns void language sql security definer set search_path = public as $$
  insert into public.esign_consents (profile_id, consent_version, ip, user_agent)
  values (p_actor, p_version, p_ip, p_ua)
  on conflict (profile_id, consent_version) do nothing
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'agreement_log(uuid,integer,uuid,text,text,text,text)',
    'agreement_create(uuid,public.agreement_kind,uuid,jsonb)',
    'agreement_save_draft(uuid,uuid,jsonb)',
    'agreement_send(uuid,uuid,jsonb,jsonb,text,text,date,text,text,text)',
    'agreement_mark_viewed(uuid,uuid,text,text)',
    'agreement_request_changes(uuid,uuid,text,text,text)',
    'agreement_void(uuid,uuid,text,text,text)',
    'agreement_record_terms(uuid)',
    'agreement_sign(uuid,uuid,integer,text,text,boolean,text,text)',
    'agreement_sign_host_services(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text)',
    'give_esign_consent(uuid,text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
