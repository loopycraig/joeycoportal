-- Baseline: the whole JoeyCo Portal schema as of 2026-11-13, exported from the live project
-- with `supabase db dump`. It replaces the earlier partial migration files, whose changes are
-- included here (see git history). Later changes go in new migration files after this one.
--
-- Added by hand below the export: the auth.users trigger that creates profiles (outside the
-- public schema, so not in the export) and the config rows the app needs to run.



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."agreement_kind" AS ENUM (
    'offer_letter',
    'housing_license',
    'host_services'
);


ALTER TYPE "public"."agreement_kind" OWNER TO "postgres";


CREATE TYPE "public"."agreement_party" AS ENUM (
    'joey',
    'host',
    'joeyco'
);


ALTER TYPE "public"."agreement_party" OWNER TO "postgres";


CREATE TYPE "public"."agreement_status" AS ENUM (
    'draft',
    'sent',
    'changes_requested',
    'awaiting_countersign',
    'executed',
    'void'
);


ALTER TYPE "public"."agreement_status" OWNER TO "postgres";


CREATE TYPE "public"."application_status" AS ENUM (
    'draft',
    'submitted'
);


ALTER TYPE "public"."application_status" OWNER TO "postgres";


CREATE TYPE "public"."fee_code" AS ENUM (
    'application',
    'match',
    'service_monthly'
);


ALTER TYPE "public"."fee_code" OWNER TO "postgres";


CREATE TYPE "public"."line_kind" AS ENUM (
    'wages',
    'rent_withholding',
    'wage_charge',
    'rent_payout',
    'rent_adjustment',
    'service_fee',
    'application_fee',
    'match_fee',
    'adjustment'
);


ALTER TYPE "public"."line_kind" OWNER TO "postgres";


CREATE TYPE "public"."payment_direction" AS ENUM (
    'payout',
    'charge'
);


ALTER TYPE "public"."payment_direction" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'canceled'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."run_kind" AS ENUM (
    'payroll',
    'host_monthly'
);


ALTER TYPE "public"."run_kind" OWNER TO "postgres";


CREATE TYPE "public"."run_status" AS ENUM (
    'draft',
    'approved',
    'processed'
);


ALTER TYPE "public"."run_status" OWNER TO "postgres";


CREATE TYPE "public"."stage_owner" AS ENUM (
    'joey',
    'joeyco',
    'references',
    'vendor',
    'host'
);


ALTER TYPE "public"."stage_owner" OWNER TO "postgres";


CREATE TYPE "public"."terms_status" AS ENUM (
    'proposed',
    'accepted',
    'declined',
    'withdrawn',
    'superseded'
);


ALTER TYPE "public"."terms_status" OWNER TO "postgres";


CREATE TYPE "public"."timecard_status" AS ENUM (
    'draft',
    'submitted',
    'approved',
    'rejected'
);


ALTER TYPE "public"."timecard_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'joey',
    'host'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_joey"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_joey uuid;
  v_id   uuid;
begin
  if public.my_role() is distinct from 'host' then
    raise exception 'Only Hosts can add Joeys';
  end if;

  select id into v_joey from public.profiles
   where lower(email) = lower(p_email) and role = 'joey';
  if v_joey is null then
    raise exception 'No Joey account found for that email';
  end if;

  select id into v_id from public.matches
   where host_id = auth.uid() and joey_id = v_joey and ended_at is null;

  if v_id is null then
    insert into public.matches (host_id, joey_id)
    values (auth.uid(), v_joey)
    returning id into v_id;
  end if;

  return v_id;
end $$;


ALTER FUNCTION "public"."add_joey"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_create"("p_actor" "uuid", "p_kind" "public"."agreement_kind", "p_match" "uuid", "p_fields" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_joey uuid;
  v_id uuid;
begin
  if (select role from public.profiles where id = p_actor) is distinct from 'host' then
    raise exception 'Only Hosts can start agreements';
  end if;
  if p_kind = 'host_services' then
    select id into v_id from public.agreements where host_id = p_actor and kind = 'host_services' and status <> 'void';
    if v_id is not null then return v_id; end if;
  else
    select joey_id into v_joey from public.matches where id = p_match and host_id = p_actor and ended_at is null;
    if v_joey is null then raise exception 'That Joey isn''t one of your active matches'; end if;
  end if;
  insert into public.agreements (kind, host_id, joey_id, match_id, draft_fields)
  values (p_kind, p_actor, v_joey, case when p_kind = 'host_services' then null else p_match end, coalesce(p_fields, '{}'::jsonb))
  returning id into v_id;
  perform public.agreement_log(v_id, null, p_actor, 'created', null, null, null);
  return v_id;
end $$;


ALTER FUNCTION "public"."agreement_create"("p_actor" "uuid", "p_kind" "public"."agreement_kind", "p_match" "uuid", "p_fields" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_log"("p_id" "uuid", "p_version" integer, "p_actor" "uuid", "p_action" "text", "p_comment" "text", "p_ip" "text", "p_ua" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.agreement_events (agreement_id, version, actor_id, action, comment, ip, user_agent)
  values (p_id, p_version, p_actor, p_action, nullif(trim(p_comment), ''), p_ip, p_ua)
$$;


ALTER FUNCTION "public"."agreement_log"("p_id" "uuid", "p_version" integer, "p_actor" "uuid", "p_action" "text", "p_comment" "text", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_mark_viewed"("p_actor" "uuid", "p_id" "uuid", "p_ip" "text", "p_ua" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_id;
  if not found or a.joey_id is distinct from p_actor or a.current_version = 0 then return; end if;
  if not exists (select 1 from public.agreement_events where agreement_id = p_id and version = a.current_version and action = 'viewed' and actor_id = p_actor) then
    perform public.agreement_log(p_id, a.current_version, p_actor, 'viewed', null, p_ip, p_ua);
  end if;
end $$;


ALTER FUNCTION "public"."agreement_mark_viewed"("p_actor" "uuid", "p_id" "uuid", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_record_terms"("p_match" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  update public.match_terms set status = 'superseded' where match_id = p_match and status = 'accepted' and effective_date = v_start;
  insert into public.match_terms (match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, note, proposed_by, proposed_at, responded_by, responded_at)
  values (p_match, v_start, v_hourly, v_rent, 'accepted', 'From the signed offer letter and housing license', m.host_id, now(), m.joey_id, now());
  return 'recorded';
end $$;


ALTER FUNCTION "public"."agreement_record_terms"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_request_changes"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare a public.agreements;
begin
  if nullif(trim(p_comment), '') is null then raise exception 'Say what you''d like changed'; end if;
  select * into a from public.agreements where id = p_id for update;
  if not found or a.joey_id is distinct from p_actor then raise exception 'Agreement not found'; end if;
  if a.status <> 'sent' then raise exception 'Changes can only be requested while you''re reviewing'; end if;
  update public.agreements set status = 'changes_requested', updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, a.current_version, p_actor, 'changes_requested', p_comment, p_ip, p_ua);
end $$;


ALTER FUNCTION "public"."agreement_request_changes"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_save_draft"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.agreements set draft_fields = p_fields, updated_at = now()
   where id = p_id and host_id = p_actor and status in ('draft', 'changes_requested', 'sent');
  if not found then raise exception 'This agreement can''t be edited now'; end if;
end $$;


ALTER FUNCTION "public"."agreement_save_draft"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_send"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_ends_on" "date", "p_note" "text", "p_ip" "text", "p_ua" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  a public.agreements;
  v_version integer;
begin
  select * into a from public.agreements where id = p_id for update;
  if not found or a.host_id <> p_actor then raise exception 'Agreement not found'; end if;
  if a.kind = 'host_services' then raise exception 'The Host Services Agreement is signed, not sent'; end if;
  if a.status not in ('draft', 'sent', 'changes_requested') then raise exception 'This agreement can''t be sent now'; end if;
  if not exists (select 1 from public.matches where id = a.match_id and ended_at is null) then raise exception 'This match has ended'; end if;
  v_version := a.current_version + 1;
  insert into public.agreement_versions (agreement_id, version, template_version, fields, rendered, content_hash, note, created_by)
  values (p_id, v_version, p_template_version, p_fields, p_rendered, p_hash, nullif(trim(p_note), ''), p_actor);
  update public.agreements
     set status = 'sent', current_version = v_version, draft_fields = p_fields, ends_on = p_ends_on, sent_at = now(), updated_at = now()
   where id = p_id;
  perform public.agreement_log(p_id, v_version, p_actor, 'sent', p_note, p_ip, p_ua);
  return v_version;
end $$;


ALTER FUNCTION "public"."agreement_send"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_ends_on" "date", "p_note" "text", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_sign"("p_actor" "uuid", "p_id" "uuid", "p_version" integer, "p_hash" "text", "p_typed_name" "text", "p_addendum_ack" boolean, "p_ip" "text", "p_ua" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  insert into public.agreement_signatures (agreement_id, version, party, signer_id, typed_name, content_hash, addendum_ack, ip, user_agent)
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


ALTER FUNCTION "public"."agreement_sign"("p_actor" "uuid", "p_id" "uuid", "p_version" integer, "p_hash" "text", "p_typed_name" "text", "p_addendum_ack" boolean, "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_sign_host_services"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_typed_name" "text", "p_joeyco_name" "text", "p_joeyco_title" "text", "p_ip" "text", "p_ua" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  update public.agreements set status = 'executed', current_version = 1, draft_fields = p_fields, executed_at = now(), updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, 1, p_actor, 'signed', null, p_ip, p_ua);
  perform public.agreement_log(p_id, 1, null, 'countersigned', 'JoeyCo, signed automatically for ' || p_joeyco_name, null, null);
  perform public.agreement_log(p_id, 1, null, 'executed', null, null, null);
  return 'executed';
end $$;


ALTER FUNCTION "public"."agreement_sign_host_services"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_typed_name" "text", "p_joeyco_name" "text", "p_joeyco_title" "text", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agreement_void"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_id for update;
  if not found or a.host_id <> p_actor then raise exception 'Agreement not found'; end if;
  if a.status in ('executed', 'void') then raise exception 'This agreement can''t be withdrawn'; end if;
  update public.agreements set status = 'void', voided_at = now(), updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, nullif(a.current_version, 0), p_actor, 'voided', p_comment, p_ip, p_ua);
end $$;


ALTER FUNCTION "public"."agreement_void"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."application_missing"("p_joey" "uuid") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select array_remove(array[
    case when nullif(trim(a.first_name), '') is null then 'first_name' end,
    case when nullif(trim(a.last_name), '') is null then 'last_name' end,
    case when length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) < 10 then 'phone' end,
    case when a.date_of_birth is null then 'date_of_birth'
         when a.date_of_birth > (current_date - interval '18 years')::date then 'under_18' end,
    case when nullif(trim(a.work_authorized), '') is null then 'work_authorized' end,
    case when nullif(trim(a.school_degree), '') is null then 'school_degree' end,
    case when nullif(trim(a.host_preference), '') is null then 'host_preference' end,
    case when cardinality(a.preferred_cities) = 0 then 'preferred_cities' end,
    case when nullif(trim(a.move_in_timing), '') is null then 'move_in_timing' end,
    case when cardinality(a.services) = 0 then 'services' end,
    case when nullif(trim(a.why_joey), '') is null then 'why_joey' end,
    case when nullif(trim(a.heard_about), '') is null then 'heard_about' end,
    case when nullif(trim(a.conduct_signature), '') is null then 'conduct_signature' end,
    case when a.news_opt_in is null then 'news_opt_in' end,
    case when (select count(*) from public.joey_references r where r.joey_id = a.joey_id) < 2 then 'references' end
  ], null)
  from public.joey_applications a
  where a.joey_id = p_joey
$$;


ALTER FUNCTION "public"."application_missing"("p_joey" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_clarify_stage"("p_joey" "uuid", "p_clarify_value" "text", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  if v_current = v_key then return 'unchanged'; end if;

  update public.joey_applications
     set stage_key = v_key, stage_changed_at = coalesce(p_at, now())
   where joey_id = p_joey;
  insert into public.application_stage_events (joey_id, stage_key, occurred_at, source)
  values (p_joey, v_key, coalesce(p_at, now()), 'clarify');
  return 'updated';
end $$;


ALTER FUNCTION "public"."apply_clarify_stage"("p_joey" "uuid", "p_clarify_value" "text", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_payment_run"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.payment_runs set status = 'approved', approved_at = now()
   where id = p_run_id and status = 'draft';
  if not found then raise exception 'Run not found or not a draft'; end if;
end $$;


ALTER FUNCTION "public"."approve_payment_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."billing_tz"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select timezone from public.billing_settings
$$;


ALTER FUNCTION "public"."billing_tz"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_see_agreement"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.agreements a
     where a.id = p_id
       and (a.host_id = auth.uid() or (a.joey_id = auth.uid() and a.current_version > 0))
  )
$$;


ALTER FUNCTION "public"."can_see_agreement"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."charge_application_fee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_today date := (now() at time zone public.billing_tz())::date;
begin
  if new.role = 'host' and old.role is null then
    insert into public.host_fees (host_id, code, amount_cents, incurred_on)
    values (new.id, 'application', public.fee_amount('application', v_today), v_today)
    on conflict do nothing;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."charge_application_fee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."charge_match_fee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_day date := (new.started_at at time zone public.billing_tz())::date;
begin
  insert into public.host_fees (host_id, match_id, code, amount_cents, incurred_on)
  values (new.host_id, new.id, 'match', public.fee_amount('match', v_day), v_day)
  on conflict do nothing;
  return new;
end $$;


ALTER FUNCTION "public"."charge_match_fee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."days_without_terms"("p_match_id" "uuid", "p_from" "date", "p_to" "date") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int
    from public.matches m
   cross join lateral generate_series(
           greatest(p_from, (m.started_at at time zone public.billing_tz())::date),
           least(p_to, coalesce((m.ended_at at time zone public.billing_tz())::date - 1, p_to)),
           interval '1 day') d
   where m.id = p_match_id
     and not exists (select 1 from public.terms_on(m.id, d::date))
$$;


ALTER FUNCTION "public"."days_without_terms"("p_match_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."display_name"("p_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(nullif(full_name, ''), email) from public.profiles where id = p_id
$$;


ALTER FUNCTION "public"."display_name"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_match"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.matches set ended_at = now()
   where id = p_match_id and host_id = auth.uid() and ended_at is null;
  if not found then
    raise exception 'Match not found or already ended';
  end if;
end $$;


ALTER FUNCTION "public"."end_match"("p_match_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."joey_applications" (
    "joey_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "date_of_birth" "date",
    "work_authorized" "text",
    "school_degree" "text",
    "preferred_cities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "move_in_timing" "text",
    "services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "why_joey" "text",
    "heard_about" "text",
    "conduct_signature" "text",
    "conduct_signed_at" timestamp with time zone,
    "news_opt_in" boolean,
    "status" "public"."application_status" DEFAULT 'draft'::"public"."application_status" NOT NULL,
    "submitted_at" timestamp with time zone,
    "stage_key" "text" DEFAULT 'draft'::"text" NOT NULL,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clarify_sync_requested_at" timestamp with time zone,
    "clarify_synced_at" timestamp with time zone,
    "clarify_sync_error" "text",
    "clarify_stage_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clarify_joey_id" "text",
    "host_preference" "text",
    "bg_disclosure_signature" "text",
    "bg_disclosure_version" "text",
    "bg_disclosure_signed_at" timestamp with time zone,
    "ca_disclosure_signature" "text",
    "ca_disclosure_version" "text",
    "ca_disclosure_signed_at" timestamp with time zone,
    "ca_report_copy_requested" boolean,
    "conduct_version" "text"
);


ALTER TABLE "public"."joey_applications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."joey_applications"."bg_disclosure_signature" IS 'Typed full name signing the federal background check disclosure and authorization';



COMMENT ON COLUMN "public"."joey_applications"."bg_disclosure_version" IS 'Version of the federal disclosure text that was signed (lib/joey/disclosures.ts)';



COMMENT ON COLUMN "public"."joey_applications"."bg_disclosure_signed_at" IS 'When the federal disclosure was signed. Set by trigger only.';



COMMENT ON COLUMN "public"."joey_applications"."ca_disclosure_signature" IS 'Typed full name signing the California investigative consumer report disclosure and authorization';



COMMENT ON COLUMN "public"."joey_applications"."ca_disclosure_version" IS 'Version of the California disclosure text that was signed (lib/joey/disclosures.ts)';



COMMENT ON COLUMN "public"."joey_applications"."ca_disclosure_signed_at" IS 'When the California disclosure was signed. Set by trigger only.';



COMMENT ON COLUMN "public"."joey_applications"."ca_report_copy_requested" IS 'Joey checked "I want a free copy of any investigative consumer report obtained about me"';



COMMENT ON COLUMN "public"."joey_applications"."conduct_version" IS 'Version of the Code of Conduct text that was signed (lib/joey/disclosures.ts)';



CREATE OR REPLACE FUNCTION "public"."ensure_my_application"() RETURNS "public"."joey_applications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_row public.joey_applications;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if (select role from public.profiles where id = v_uid) is distinct from 'joey' then
    raise exception 'Only Joeys have an application.';
  end if;

  select * into v_row from public.joey_applications where joey_id = v_uid;
  if found then return v_row; end if;

  select nullif(trim(full_name), '') into v_name from public.profiles where id = v_uid;
  insert into public.joey_applications (joey_id, first_name, last_name)
  values (v_uid, split_part(v_name, ' ', 1), nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''))
  on conflict (joey_id) do nothing;

  insert into public.application_stage_events (joey_id, stage_key, source)
  select v_uid, 'draft', 'portal'
  where not exists (select 1 from public.application_stage_events where joey_id = v_uid);

  select * into v_row from public.joey_applications where joey_id = v_uid;
  return v_row;
end $$;


ALTER FUNCTION "public"."ensure_my_application"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fee_amount"("p_code" "public"."fee_code", "p_on" "date") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select amount_cents from public.fee_schedule
     where code = p_code and effective_date <= p_on
     order by effective_date desc limit 1), 0)
$$;


ALTER FUNCTION "public"."fee_amount"("p_code" "public"."fee_code", "p_on" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_due_payment_runs"("p_today" "date" DEFAULT NULL::"date") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s        public.billing_settings;
  v_today  date;
  v_d      date;
begin
  select * into s from public.billing_settings;
  v_today := coalesce(p_today, (now() at time zone s.timezone)::date);

  v_d := s.payroll_anchor;
  while v_d + 13 + s.payroll_run_delay_days <= v_today loop
    if not exists (select 1 from public.payment_runs where kind = 'payroll' and period_start = v_d) then
      return next public.generate_payroll_run(v_d);
    end if;
    v_d := v_d + 14;
  end loop;

  v_d := s.host_billing_start;
  while v_d - s.host_run_lead_days <= v_today loop
    if not exists (select 1 from public.payment_runs where kind = 'host_monthly' and period_start = v_d) then
      return next public.generate_host_monthly_run(v_d);
    end if;
    v_d := (v_d + interval '1 month')::date;
  end loop;
end $$;


ALTER FUNCTION "public"."generate_due_payment_runs"("p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_host_monthly_run"("p_month" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s        public.billing_settings;
  v_ms     date := date_trunc('month', p_month)::date;
  v_me     date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_run    uuid;
  v_line   uuid;
  v_amt    int;
  v_paid   int;
  v_warn   jsonb := '[]';
  r        record;
  mon      date;
begin
  select * into s from public.billing_settings;
  if v_ms < s.host_billing_start then
    raise exception 'Host billing starts %', s.host_billing_start;
  end if;

  insert into public.payment_runs (kind, period_start, period_end, pay_date)
  values ('host_monthly', v_ms, v_me, v_ms)
  returning id into v_run;

  -- 1. Rent for this month, in advance
  for r in select * from public.matches_active_between(v_ms, v_me) loop
    v_amt := round(public.rent_for_range(r.id, v_ms, v_me));
    if v_amt > 0 then
      insert into public.payment_lines
        (run_id, party_id, match_id, kind, description, service_start, service_end, amount_cents)
      values
        (v_run, r.host_id, r.id, 'rent_payout',
         format('Rent from %s for %s', public.display_name(r.joey_id), to_char(v_ms, 'FMMonth YYYY')),
         v_ms, v_me, v_amt);
    end if;
    if public.days_without_terms(r.id, v_ms, v_me) > 0 then
      v_warn := v_warn || jsonb_build_object(
        'match_id', r.id,
        'message', format('%s and %s have %s day(s) in %s with no agreed rent',
                          public.display_name(r.host_id), public.display_name(r.joey_id),
                          public.days_without_terms(r.id, v_ms, v_me), to_char(v_ms, 'FMMonth')));
    end if;
  end loop;

  -- 2. True-up earlier months: rent actually owed (after term changes, mid-month
  --    starts and early endings) minus what the Host was already paid.
  for r in
    select m.*, gs::date as mon
      from public.matches m
     cross join lateral generate_series(
             greatest(date_trunc('month', m.started_at at time zone s.timezone)::date, s.host_billing_start),
             least((v_ms - interval '1 month')::date,
                   coalesce(date_trunc('month', m.ended_at at time zone s.timezone)::date, v_ms)),
             interval '1 month') gs
  loop
    mon := r.mon;
    v_amt := round(public.rent_for_range(r.id, mon, (mon + interval '1 month - 1 day')::date));
    select coalesce(sum(amount_cents), 0) into v_paid
      from public.payment_lines
     where match_id = r.id and party_id = r.host_id
       and kind in ('rent_payout', 'rent_adjustment')
       and service_start = mon;
    if v_amt <> v_paid then
      insert into public.payment_lines
        (run_id, party_id, match_id, kind, description, service_start, service_end, amount_cents)
      values
        (v_run, r.host_id, r.id, 'rent_adjustment',
         format('Rent adjustment for %s, %s', public.display_name(r.joey_id), to_char(mon, 'FMMonth YYYY')),
         mon, (mon + interval '1 month - 1 day')::date, v_amt - v_paid);
    end if;
  end loop;

  -- 3. Service fee: one per Host with any match active this month
  v_amt := public.fee_amount('service_monthly', v_ms);
  if v_amt > 0 then
    insert into public.payment_lines (run_id, party_id, kind, description, service_start, service_end, amount_cents)
    select distinct v_run, m.host_id, 'service_fee'::public.line_kind,
           format('JoeyCo service fee, %s', to_char(v_ms, 'FMMonth YYYY')), v_ms, v_me, -v_amt
      from public.matches_active_between(v_ms, v_me) m;
  end if;

  -- 4. One-time fees incurred through month end and not yet billed
  for r in
    select * from public.host_fees
     where payment_line_id is null and not waived and amount_cents > 0 and incurred_on <= v_me
  loop
    insert into public.payment_lines (run_id, party_id, match_id, kind, description, service_start, amount_cents)
    values (v_run, r.host_id, r.match_id,
            case r.code when 'application' then 'application_fee'::public.line_kind else 'match_fee'::public.line_kind end,
            case r.code when 'application' then 'Application fee'
                        else format('Match fee, %s', public.display_name(
                               (select joey_id from public.matches where id = r.match_id))) end,
            r.incurred_on, -r.amount_cents)
    returning id into v_line;
    update public.host_fees set payment_line_id = v_line where id = r.id;
  end loop;

  perform public.net_run_payments(v_run);
  update public.payment_runs set warnings = v_warn where id = v_run;
  return v_run;
end $$;


ALTER FUNCTION "public"."generate_host_monthly_run"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_payroll_run"("p_period_start" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s       public.billing_settings;
  v_end   date := p_period_start + 13;
  v_from  date;
  v_run   uuid;
  v_line  uuid;
  v_amt   int;
  v_warn  jsonb := '[]';
  r       record;
begin
  select * into s from public.billing_settings;
  if (p_period_start - s.payroll_anchor) % 14 <> 0 or p_period_start < s.payroll_anchor then
    raise exception '% is not a pay period start (periods start every 14 days from %)', p_period_start, s.payroll_anchor;
  end if;

  insert into public.payment_runs (kind, period_start, period_end, pay_date)
  values ('payroll', p_period_start, v_end, v_end + s.payday_offset_days)
  returning id into v_run;

  -- 1. Wages: every approved, not-yet-paid timecard through period end,
  --    grouped by match, week (Mon–Sun) and the rate in force that day.
  for r in
    select t.match_id, t.joey_id, t.host_id,
           date_trunc('week', t.work_date)::date as week_start,
           mt.hourly_rate_cents                 as rate,
           sum(t.hours)                         as hours,
           array_agg(t.id)                      as ids
      from public.timecards t
      left join lateral public.terms_on(t.match_id, t.work_date) mt on true
     where t.status = 'approved' and t.payroll_line_id is null and t.work_date <= v_end
     group by 1, 2, 3, 4, 5
     order by 4, 1
  loop
    if r.rate is null then
      v_warn := v_warn || jsonb_build_object(
        'match_id', r.match_id,
        'message', format('%s hours for %s (week of %s) held back: no agreed hourly rate for those days',
                          r.hours, public.display_name(r.joey_id), to_char(r.week_start, 'Mon FMDD')));
      continue;
    end if;

    v_amt := round(r.hours * r.rate);

    insert into public.payment_lines
      (run_id, party_id, match_id, kind, description, service_start, service_end, quantity, unit_amount_cents, amount_cents)
    values
      (v_run, r.joey_id, r.match_id, 'wages',
       format('Hours for %s, week of %s', public.display_name(r.host_id), to_char(r.week_start, 'Mon FMDD')),
       r.week_start, r.week_start + 6, r.hours, r.rate, v_amt)
    returning id into v_line;

    insert into public.payment_lines
      (run_id, party_id, match_id, kind, description, service_start, service_end, quantity, unit_amount_cents, amount_cents)
    values
      (v_run, r.host_id, r.match_id, 'wage_charge',
       format('Hours from %s, week of %s', public.display_name(r.joey_id), to_char(r.week_start, 'Mon FMDD')),
       r.week_start, r.week_start + 6, r.hours, r.rate, -v_amt);

    update public.timecards set payroll_line_id = v_line where id = any(r.ids);
  end loop;

  -- 2. Rent withholding: the Joey's rent for the days in this period.
  --    JoeyCo already paid the Host this rent in advance; this recovers it.
  --    Only days from host_billing_start on, since earlier rent wasn't fronted by JoeyCo.
  v_from := greatest(p_period_start, s.host_billing_start);
  for r in select * from public.matches_active_between(v_from, v_end) loop
    v_amt := round(public.rent_for_range(r.id, v_from, v_end));
    if v_amt > 0 then
      insert into public.payment_lines
        (run_id, party_id, match_id, kind, description, service_start, service_end, amount_cents)
      values
        (v_run, r.joey_id, r.id, 'rent_withholding',
         format('Rent to %s, %s – %s', public.display_name(r.host_id),
                to_char(greatest(v_from, (r.started_at at time zone s.timezone)::date), 'Mon FMDD'),
                to_char(least(v_end, coalesce((r.ended_at at time zone s.timezone)::date - 1, v_end)), 'Mon FMDD')),
         greatest(v_from, (r.started_at at time zone s.timezone)::date),
         least(v_end, coalesce((r.ended_at at time zone s.timezone)::date - 1, v_end)),
         -v_amt);
    end if;
    if public.days_without_terms(r.id, v_from, v_end) > 0 then
      v_warn := v_warn || jsonb_build_object(
        'match_id', r.id,
        'message', format('%s and %s have %s active day(s) this period with no agreed rent',
                          public.display_name(r.host_id), public.display_name(r.joey_id),
                          public.days_without_terms(r.id, v_from, v_end)));
    end if;
  end loop;

  perform public.net_run_payments(v_run);
  update public.payment_runs set warnings = v_warn where id = v_run;
  return v_run;
end $$;


ALTER FUNCTION "public"."generate_payroll_run"("p_period_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."give_esign_consent"("p_actor" "uuid", "p_version" "text", "p_ip" "text", "p_ua" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.esign_consents (profile_id, consent_version, ip, user_agent)
  values (p_actor, p_version, p_ip, p_ua)
  on conflict (profile_id, consent_version) do nothing
$$;


ALTER FUNCTION "public"."give_esign_consent"("p_actor" "uuid", "p_version" "text", "p_ip" "text", "p_ua" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."joey_applications_before_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  if new.conduct_signature is distinct from old.conduct_signature then
    new.conduct_signed_at := case when nullif(trim(new.conduct_signature), '') is null then null else now() end;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."joey_applications_before_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."joey_can_edit_references"("p_joey" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select s.joey_can_edit_references
    from public.joey_applications a
    join public.application_stages s on s.key = a.stage_key
    where a.joey_id = p_joey
  ), false)
$$;


ALTER FUNCTION "public"."joey_can_edit_references"("p_joey" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."joey_references_after_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_joey uuid := coalesce(new.joey_id, old.joey_id);
begin
  if tg_op = 'INSERT' and (select count(*) from public.joey_references where joey_id = v_joey) > 5 then
    raise exception 'You can list up to 5 references.';
  end if;
  update public.joey_applications
     set clarify_sync_requested_at = now()
   where joey_id = v_joey and status = 'submitted';
  return null;
end $$;


ALTER FUNCTION "public"."joey_references_after_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_locked_through"("p_match_id" "uuid") RETURNS "date"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select max(d) from (
    select max(t.work_date) as d
      from public.timecards t
     where t.match_id = p_match_id and t.payroll_line_id is not null
    union all
    select max(l.service_end)
      from public.payment_lines l
     where l.match_id = p_match_id and l.kind = 'rent_withholding'
  ) x
$$;


ALTER FUNCTION "public"."match_locked_through"("p_match_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid" NOT NULL,
    "joey_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "matches_check" CHECK ((("ended_at" IS NULL) OR ("ended_at" >= "started_at")))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."matches_active_between"("p_from" "date", "p_to" "date") RETURNS SETOF "public"."matches"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from public.matches m
   where (m.started_at at time zone public.billing_tz())::date <= p_to
     and (m.ended_at is null or (m.ended_at at time zone public.billing_tz())::date - 1 >= p_from)
     and (m.ended_at is null or m.ended_at > m.started_at)
$$;


ALTER FUNCTION "public"."matches_active_between"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_application_missing"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.application_missing(auth.uid())
$$;


ALTER FUNCTION "public"."my_application_missing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."net_run_payments"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_due date;
begin
  select pay_date into v_due from public.payment_runs where id = p_run_id;
  insert into public.payments (run_id, party_id, direction, amount_cents, due_date)
  select p_run_id, party_id,
         case when sum(amount_cents) > 0 then 'payout'::public.payment_direction
              else 'charge'::public.payment_direction end,
         abs(sum(amount_cents)), v_due
    from public.payment_lines
   where run_id = p_run_id
   group by party_id
  having sum(amount_cents) <> 0;
end $$;


ALTER FUNCTION "public"."net_run_payments"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propose_terms"("p_match_id" "uuid", "p_effective_date" "date", "p_hourly_rate_cents" integer, "p_monthly_rent_cents" integer, "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_locked date;
  v_id     uuid;
begin
  if not exists (
    select 1 from public.matches
     where id = p_match_id and ended_at is null
       and auth.uid() in (host_id, joey_id)
  ) then
    raise exception 'Match not found or already ended';
  end if;

  if p_hourly_rate_cents < 0 or p_monthly_rent_cents < 0 then
    raise exception 'Amounts can''t be negative';
  end if;

  v_locked := public.match_locked_through(p_match_id);
  if v_locked is not null and p_effective_date <= v_locked then
    raise exception 'Pay through % has already been calculated. Pick a date after that.', to_char(v_locked, 'Mon FMDD, YYYY');
  end if;

  update public.match_terms set status = 'withdrawn', responded_by = auth.uid(), responded_at = now()
   where match_id = p_match_id and status = 'proposed';

  insert into public.match_terms
    (match_id, effective_date, hourly_rate_cents, monthly_rent_cents, note, proposed_by)
  values
    (p_match_id, p_effective_date, p_hourly_rate_cents, p_monthly_rent_cents, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."propose_terms"("p_match_id" "uuid", "p_effective_date" "date", "p_hourly_rate_cents" integer, "p_monthly_rent_cents" integer, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_payment_run"("p_run_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.payment_runs;
begin
  select * into v from public.payment_runs where id = p_run_id and status = 'draft';
  if not found then raise exception 'Run not found or not a draft'; end if;
  delete from public.payment_runs where id = p_run_id;
  if v.kind = 'payroll' then
    return public.generate_payroll_run(v.period_start);
  else
    return public.generate_host_monthly_run(v.period_start);
  end if;
end $$;


ALTER FUNCTION "public"."regenerate_payment_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rent_for_range"("p_match_id" "uuid", "p_from" "date", "p_to" "date") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(
           t.monthly_rent_cents::numeric
           / extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))
         ), 0)
    from public.matches m
   cross join lateral generate_series(
           greatest(p_from, (m.started_at at time zone public.billing_tz())::date),
           least(p_to, coalesce((m.ended_at at time zone public.billing_tz())::date - 1, p_to)),
           interval '1 day') d
   cross join lateral public.terms_on(m.id, d::date) t
   where m.id = p_match_id
$$;


ALTER FUNCTION "public"."rent_for_range"("p_match_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_terms"("p_terms_id" "uuid", "p_accept" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v       public.match_terms;
  v_lock  date;
begin
  select t.* into v
    from public.match_terms t
    join public.matches m on m.id = t.match_id
   where t.id = p_terms_id and t.status = 'proposed'
     and m.ended_at is null
     and auth.uid() in (m.host_id, m.joey_id)
   for update of t;

  if not found then raise exception 'Proposal not found or no longer open'; end if;
  if v.proposed_by = auth.uid() then raise exception 'The other person needs to respond to this proposal'; end if;

  if p_accept then
    v_lock := public.match_locked_through(v.match_id);
    if v_lock is not null and v.effective_date <= v_lock then
      raise exception 'Pay through % has already been calculated, so these terms can''t start on %. Propose a later date.',
        to_char(v_lock, 'Mon FMDD'), to_char(v.effective_date, 'Mon FMDD');
    end if;
    update public.match_terms set status = 'superseded'
     where match_id = v.match_id and status = 'accepted' and effective_date = v.effective_date;
  end if;

  update public.match_terms
     set status = case when p_accept then 'accepted'::public.terms_status else 'declined'::public.terms_status end,
         responded_by = auth.uid(), responded_at = now()
   where id = p_terms_id;
end $$;


ALTER FUNCTION "public"."respond_to_terms"("p_terms_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_timecard"("p_id" "uuid", "p_decision" "public"."timecard_status", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  update public.timecards
     set status = p_decision, reviewed_at = now(), review_note = p_note
   where id = p_id and host_id = auth.uid() and status = 'submitted';

  if not found then
    raise exception 'Timecard not found or not awaiting review';
  end if;
end $$;


ALTER FUNCTION "public"."review_timecard"("p_id" "uuid", "p_decision" "public"."timecard_status", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_role"("p_role" "public"."user_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles set role = p_role
   where id = auth.uid() and role is null;
  if not found then
    raise exception 'Role already set';
  end if;
end $$;


ALTER FUNCTION "public"."set_my_role"("p_role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_disclosure_signatures"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.bg_disclosure_signature is distinct from old.bg_disclosure_signature then
    new.bg_disclosure_signed_at :=
      case when nullif(trim(new.bg_disclosure_signature), '') is null then null else now() end;
  else
    new.bg_disclosure_signed_at := old.bg_disclosure_signed_at;
  end if;

  if new.ca_disclosure_signature is distinct from old.ca_disclosure_signature then
    new.ca_disclosure_signed_at :=
      case when nullif(trim(new.ca_disclosure_signature), '') is null then null else now() end;
  else
    new.ca_disclosure_signed_at := old.ca_disclosure_signed_at;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."stamp_disclosure_signatures"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_my_application"() RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_status public.application_status;
  v_missing text[];
begin
  select status into v_status from public.joey_applications where joey_id = v_uid for update;
  if not found then raise exception 'No application found.'; end if;
  if v_status = 'submitted' then return '{}'; end if;

  v_missing := public.application_missing(v_uid);
  if cardinality(v_missing) > 0 then return v_missing; end if;

  update public.joey_applications
     set status = 'submitted',
         submitted_at = now(),
         stage_key = 'in_review',
         stage_changed_at = now(),
         clarify_sync_requested_at = now()
   where joey_id = v_uid;

  insert into public.application_stage_events (joey_id, stage_key, source)
  values (v_uid, 'in_review', 'portal');
  return '{}';
end $$;


ALTER FUNCTION "public"."submit_my_application"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "effective_date" "date" NOT NULL,
    "hourly_rate_cents" integer NOT NULL,
    "monthly_rent_cents" integer NOT NULL,
    "status" "public"."terms_status" DEFAULT 'proposed'::"public"."terms_status" NOT NULL,
    "note" "text",
    "proposed_by" "uuid" NOT NULL,
    "proposed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_by" "uuid",
    "responded_at" timestamp with time zone,
    CONSTRAINT "match_terms_hourly_rate_cents_check" CHECK (("hourly_rate_cents" >= 0)),
    CONSTRAINT "match_terms_monthly_rent_cents_check" CHECK (("monthly_rent_cents" >= 0))
);


ALTER TABLE "public"."match_terms" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."terms_on"("p_match_id" "uuid", "p_date" "date") RETURNS SETOF "public"."match_terms"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from public.match_terms
   where match_id = p_match_id and status = 'accepted' and effective_date <= p_date
   order by effective_date desc
   limit 1
$$;


ALTER FUNCTION "public"."terms_on"("p_match_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."timecards_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  if new.status = 'submitted'
     and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    new.submitted_at = now();
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."timecards_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ begin new.updated_at := now(); return new; end $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_payment_run"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.payment_runs where id = p_run_id and status = 'draft';
  if not found then raise exception 'Run not found or not a draft'; end if;
end $$;


ALTER FUNCTION "public"."void_payment_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_terms"("p_terms_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.match_terms set status = 'withdrawn', responded_by = auth.uid(), responded_at = now()
   where id = p_terms_id and status = 'proposed' and proposed_by = auth.uid();
  if not found then raise exception 'Proposal not found or no longer open'; end if;
end $$;


ALTER FUNCTION "public"."withdraw_terms"("p_terms_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agreement_events" (
    "id" bigint NOT NULL,
    "agreement_id" "uuid" NOT NULL,
    "version" integer,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "comment" "text",
    "ip" "text",
    "user_agent" "text",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agreement_events_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'sent'::"text", 'viewed'::"text", 'changes_requested'::"text", 'signed'::"text", 'countersigned'::"text", 'voided'::"text", 'executed'::"text"])))
);


ALTER TABLE "public"."agreement_events" OWNER TO "postgres";


ALTER TABLE "public"."agreement_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."agreement_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."agreement_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agreement_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "party" "public"."agreement_party" NOT NULL,
    "signer_id" "uuid",
    "typed_name" "text" NOT NULL,
    "signer_title" "text",
    "content_hash" "text" NOT NULL,
    "addendum_ack" boolean,
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."agreement_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agreement_versions" (
    "agreement_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "template_version" "text" NOT NULL,
    "fields" "jsonb" NOT NULL,
    "rendered" "jsonb" NOT NULL,
    "content_hash" "text" NOT NULL,
    "note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agreement_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "public"."agreement_kind" NOT NULL,
    "host_id" "uuid" NOT NULL,
    "joey_id" "uuid",
    "match_id" "uuid",
    "status" "public"."agreement_status" DEFAULT 'draft'::"public"."agreement_status" NOT NULL,
    "draft_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "current_version" integer DEFAULT 0 NOT NULL,
    "ends_on" "date",
    "replaces_id" "uuid",
    "provider" "text" DEFAULT 'portal'::"text" NOT NULL,
    "provider_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "voided_at" timestamp with time zone,
    CONSTRAINT "agreements_parties" CHECK (((("kind" = 'host_services'::"public"."agreement_kind") AND ("joey_id" IS NULL) AND ("match_id" IS NULL)) OR (("kind" <> 'host_services'::"public"."agreement_kind") AND ("joey_id" IS NOT NULL) AND ("match_id" IS NOT NULL)))),
    CONSTRAINT "agreements_provider_check" CHECK (("provider" = ANY (ARRAY['portal'::"text", 'pandadoc'::"text"])))
);


ALTER TABLE "public"."agreements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."application_stage_events" (
    "id" bigint NOT NULL,
    "joey_id" "uuid" NOT NULL,
    "stage_key" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    CONSTRAINT "application_stage_events_source_check" CHECK (("source" = ANY (ARRAY['portal'::"text", 'clarify'::"text"])))
);


ALTER TABLE "public"."application_stage_events" OWNER TO "postgres";


ALTER TABLE "public"."application_stage_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."application_stage_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."application_stages" (
    "key" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "title" "text" NOT NULL,
    "joey_message" "text" NOT NULL,
    "owner" "public"."stage_owner" NOT NULL,
    "owner_label" "text" NOT NULL,
    "typical_duration" "text",
    "clarify_values" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "on_path" boolean DEFAULT true NOT NULL,
    "joey_can_edit_references" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."application_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "timezone" "text" DEFAULT 'America/Denver'::"text" NOT NULL,
    "payroll_anchor" "date" DEFAULT '2026-11-16'::"date" NOT NULL,
    "payroll_run_delay_days" integer DEFAULT 2 NOT NULL,
    "payday_offset_days" integer DEFAULT 5 NOT NULL,
    "host_billing_start" "date" DEFAULT '2026-12-01'::"date" NOT NULL,
    "host_run_lead_days" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_settings_host_billing_start_check" CHECK ((EXTRACT("day" FROM "host_billing_start") = (1)::numeric)),
    CONSTRAINT "billing_settings_host_run_lead_days_check" CHECK (("host_run_lead_days" >= 0)),
    CONSTRAINT "billing_settings_id_check" CHECK ("id"),
    CONSTRAINT "billing_settings_payday_offset_days_check" CHECK (("payday_offset_days" >= 0)),
    CONSTRAINT "billing_settings_payroll_anchor_check" CHECK ((EXTRACT("isodow" FROM "payroll_anchor") = (1)::numeric)),
    CONSTRAINT "billing_settings_payroll_run_delay_days_check" CHECK (("payroll_run_delay_days" >= 0))
);


ALTER TABLE "public"."billing_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."esign_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "consent_version" "text" NOT NULL,
    "consented_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."esign_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fee_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "public"."fee_code" NOT NULL,
    "amount_cents" integer NOT NULL,
    "effective_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fee_schedule_amount_cents_check" CHECK (("amount_cents" >= 0))
);


ALTER TABLE "public"."fee_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."host_fees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid" NOT NULL,
    "match_id" "uuid",
    "code" "public"."fee_code" NOT NULL,
    "amount_cents" integer NOT NULL,
    "incurred_on" "date" NOT NULL,
    "waived" boolean DEFAULT false NOT NULL,
    "payment_line_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "host_fees_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "host_fees_code_check" CHECK (("code" = ANY (ARRAY['application'::"public"."fee_code", 'match'::"public"."fee_code"])))
);


ALTER TABLE "public"."host_fees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."joey_references" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "joey_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "relationship" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "known_for" "text" NOT NULL,
    "clarify_person_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clarify_reference_id" "text",
    "reference_type" "text",
    CONSTRAINT "joey_references_email_check" CHECK (("email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text")),
    CONSTRAINT "joey_references_full_name_check" CHECK (("length"(TRIM(BOTH FROM "full_name")) > 0)),
    CONSTRAINT "joey_references_known_for_check" CHECK (("length"(TRIM(BOTH FROM "known_for")) > 0)),
    CONSTRAINT "joey_references_phone_check" CHECK (("length"("regexp_replace"("phone", '\D'::"text", ''::"text", 'g'::"text")) >= 10)),
    CONSTRAINT "joey_references_reference_type_check" CHECK (("reference_type" = ANY (ARRAY['Professional'::"text", 'Institutional'::"text", 'Landlord'::"text", 'Housemate'::"text", 'Personal'::"text"]))),
    CONSTRAINT "joey_references_relationship_check" CHECK (("length"(TRIM(BOTH FROM "relationship")) > 0))
);


ALTER TABLE "public"."joey_references" OWNER TO "postgres";


COMMENT ON COLUMN "public"."joey_references"."reference_type" IS 'Kind of reference, sent to Clarify c_reference.type';



CREATE TABLE IF NOT EXISTS "public"."payment_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "party_id" "uuid" NOT NULL,
    "match_id" "uuid",
    "kind" "public"."line_kind" NOT NULL,
    "description" "text" NOT NULL,
    "service_start" "date",
    "service_end" "date",
    "quantity" numeric(10,2),
    "unit_amount_cents" integer,
    "amount_cents" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "public"."run_kind" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "pay_date" "date" NOT NULL,
    "status" "public"."run_status" DEFAULT 'draft'::"public"."run_status" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."payment_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "party_id" "uuid" NOT NULL,
    "direction" "public"."payment_direction" NOT NULL,
    "amount_cents" integer NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "processor" "text",
    "processor_ref" "text",
    "failure_reason" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_amount_cents_check" CHECK (("amount_cents" > 0))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "role" "public"."user_role",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clarify_person_id" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_state" (
    "key" "text" NOT NULL,
    "value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."timecards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "joey_id" "uuid" NOT NULL,
    "host_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "hours" numeric(4,2) NOT NULL,
    "notes" "text",
    "status" "public"."timecard_status" DEFAULT 'draft'::"public"."timecard_status" NOT NULL,
    "submitted_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payroll_line_id" "uuid",
    CONSTRAINT "timecards_hours_check" CHECK ((("hours" > (0)::numeric) AND ("hours" <= (24)::numeric)))
);


ALTER TABLE "public"."timecards" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agreement_events"
    ADD CONSTRAINT "agreement_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreement_signatures"
    ADD CONSTRAINT "agreement_signatures_agreement_id_version_party_key" UNIQUE ("agreement_id", "version", "party");



ALTER TABLE ONLY "public"."agreement_signatures"
    ADD CONSTRAINT "agreement_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_pkey" PRIMARY KEY ("agreement_id", "version");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_stage_events"
    ADD CONSTRAINT "application_stage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_stages"
    ADD CONSTRAINT "application_stages_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."billing_settings"
    ADD CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."esign_consents"
    ADD CONSTRAINT "esign_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."esign_consents"
    ADD CONSTRAINT "esign_consents_profile_id_consent_version_key" UNIQUE ("profile_id", "consent_version");



ALTER TABLE ONLY "public"."fee_schedule"
    ADD CONSTRAINT "fee_schedule_code_effective_date_key" UNIQUE ("code", "effective_date");



ALTER TABLE ONLY "public"."fee_schedule"
    ADD CONSTRAINT "fee_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."host_fees"
    ADD CONSTRAINT "host_fees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."joey_applications"
    ADD CONSTRAINT "joey_applications_clarify_joey_id_key" UNIQUE ("clarify_joey_id");



ALTER TABLE ONLY "public"."joey_applications"
    ADD CONSTRAINT "joey_applications_pkey" PRIMARY KEY ("joey_id");



ALTER TABLE ONLY "public"."joey_references"
    ADD CONSTRAINT "joey_references_clarify_reference_id_key" UNIQUE ("clarify_reference_id");



ALTER TABLE ONLY "public"."joey_references"
    ADD CONSTRAINT "joey_references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_terms"
    ADD CONSTRAINT "match_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_lines"
    ADD CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_runs"
    ADD CONSTRAINT "payment_runs_kind_period_start_key" UNIQUE ("kind", "period_start");



ALTER TABLE ONLY "public"."payment_runs"
    ADD CONSTRAINT "payment_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_run_id_party_id_key" UNIQUE ("run_id", "party_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_clarify_person_id_key" UNIQUE ("clarify_person_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_state"
    ADD CONSTRAINT "sync_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."timecards"
    ADD CONSTRAINT "timecards_pkey" PRIMARY KEY ("id");



CREATE INDEX "agreement_events_agreement_idx" ON "public"."agreement_events" USING "btree" ("agreement_id", "at");



CREATE INDEX "agreements_host_idx" ON "public"."agreements" USING "btree" ("host_id");



CREATE INDEX "agreements_joey_idx" ON "public"."agreements" USING "btree" ("joey_id");



CREATE INDEX "agreements_match_idx" ON "public"."agreements" USING "btree" ("match_id");



CREATE UNIQUE INDEX "agreements_one_hsa" ON "public"."agreements" USING "btree" ("host_id") WHERE (("kind" = 'host_services'::"public"."agreement_kind") AND ("status" <> 'void'::"public"."agreement_status"));



CREATE INDEX "application_stage_events_joey_id_occurred_at_idx" ON "public"."application_stage_events" USING "btree" ("joey_id", "occurred_at");



CREATE UNIQUE INDEX "host_fees_one_application" ON "public"."host_fees" USING "btree" ("host_id") WHERE ("code" = 'application'::"public"."fee_code");



CREATE UNIQUE INDEX "host_fees_one_per_match" ON "public"."host_fees" USING "btree" ("match_id") WHERE ("code" = 'match'::"public"."fee_code");



CREATE INDEX "joey_applications_clarify_sync_requested_at_idx" ON "public"."joey_applications" USING "btree" ("clarify_sync_requested_at") WHERE ("clarify_sync_requested_at" IS NOT NULL);



CREATE INDEX "joey_references_joey_id_idx" ON "public"."joey_references" USING "btree" ("joey_id");



CREATE INDEX "match_terms_match_id_effective_date_idx" ON "public"."match_terms" USING "btree" ("match_id", "effective_date" DESC) WHERE ("status" = 'accepted'::"public"."terms_status");



CREATE UNIQUE INDEX "match_terms_one_pending" ON "public"."match_terms" USING "btree" ("match_id") WHERE ("status" = 'proposed'::"public"."terms_status");



CREATE UNIQUE INDEX "match_terms_one_per_date" ON "public"."match_terms" USING "btree" ("match_id", "effective_date") WHERE ("status" = 'accepted'::"public"."terms_status");



CREATE INDEX "matches_joey_id_idx" ON "public"."matches" USING "btree" ("joey_id");



CREATE UNIQUE INDEX "matches_one_open_per_pair" ON "public"."matches" USING "btree" ("host_id", "joey_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "payment_lines_match_id_kind_service_start_idx" ON "public"."payment_lines" USING "btree" ("match_id", "kind", "service_start");



CREATE INDEX "payment_lines_party_id_idx" ON "public"."payment_lines" USING "btree" ("party_id");



CREATE INDEX "payment_lines_run_id_party_id_idx" ON "public"."payment_lines" USING "btree" ("run_id", "party_id");



CREATE INDEX "payments_party_id_due_date_idx" ON "public"."payments" USING "btree" ("party_id", "due_date" DESC);



CREATE INDEX "payments_status_due_date_idx" ON "public"."payments" USING "btree" ("status", "due_date");



CREATE INDEX "timecards_host_id_status_idx" ON "public"."timecards" USING "btree" ("host_id", "status");



CREATE INDEX "timecards_joey_id_work_date_idx" ON "public"."timecards" USING "btree" ("joey_id", "work_date" DESC);



CREATE INDEX "timecards_match_id_idx" ON "public"."timecards" USING "btree" ("match_id");



CREATE INDEX "timecards_status_payroll_line_id_idx" ON "public"."timecards" USING "btree" ("status", "payroll_line_id") WHERE ("status" = 'approved'::"public"."timecard_status");



CREATE OR REPLACE TRIGGER "charge_application_fee" AFTER UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."charge_application_fee"();



CREATE OR REPLACE TRIGGER "charge_match_fee" AFTER INSERT ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."charge_match_fee"();



CREATE OR REPLACE TRIGGER "joey_applications_before_update" BEFORE UPDATE ON "public"."joey_applications" FOR EACH ROW EXECUTE FUNCTION "public"."joey_applications_before_update"();



CREATE OR REPLACE TRIGGER "joey_references_after_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."joey_references" FOR EACH ROW EXECUTE FUNCTION "public"."joey_references_after_change"();



CREATE OR REPLACE TRIGGER "joey_references_touch" BEFORE UPDATE ON "public"."joey_references" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "stamp_disclosure_signatures" BEFORE UPDATE ON "public"."joey_applications" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_disclosure_signatures"();



CREATE OR REPLACE TRIGGER "timecards_touch" BEFORE INSERT OR UPDATE ON "public"."timecards" FOR EACH ROW EXECUTE FUNCTION "public"."timecards_touch"();



ALTER TABLE ONLY "public"."agreement_events"
    ADD CONSTRAINT "agreement_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agreement_events"
    ADD CONSTRAINT "agreement_events_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agreement_signatures"
    ADD CONSTRAINT "agreement_signatures_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agreement_signatures"
    ADD CONSTRAINT "agreement_signatures_agreement_id_version_fkey" FOREIGN KEY ("agreement_id", "version") REFERENCES "public"."agreement_versions"("agreement_id", "version");



ALTER TABLE ONLY "public"."agreement_signatures"
    ADD CONSTRAINT "agreement_signatures_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agreement_versions"
    ADD CONSTRAINT "agreement_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_joey_id_fkey" FOREIGN KEY ("joey_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "public"."agreements"("id");



ALTER TABLE ONLY "public"."application_stage_events"
    ADD CONSTRAINT "application_stage_events_joey_id_fkey" FOREIGN KEY ("joey_id") REFERENCES "public"."joey_applications"("joey_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."application_stage_events"
    ADD CONSTRAINT "application_stage_events_stage_key_fkey" FOREIGN KEY ("stage_key") REFERENCES "public"."application_stages"("key");



ALTER TABLE ONLY "public"."esign_consents"
    ADD CONSTRAINT "esign_consents_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."host_fees"
    ADD CONSTRAINT "host_fees_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."host_fees"
    ADD CONSTRAINT "host_fees_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."host_fees"
    ADD CONSTRAINT "host_fees_payment_line_fk" FOREIGN KEY ("payment_line_id") REFERENCES "public"."payment_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."joey_applications"
    ADD CONSTRAINT "joey_applications_joey_id_fkey" FOREIGN KEY ("joey_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."joey_applications"
    ADD CONSTRAINT "joey_applications_stage_key_fkey" FOREIGN KEY ("stage_key") REFERENCES "public"."application_stages"("key");



ALTER TABLE ONLY "public"."joey_references"
    ADD CONSTRAINT "joey_references_joey_id_fkey" FOREIGN KEY ("joey_id") REFERENCES "public"."joey_applications"("joey_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_terms"
    ADD CONSTRAINT "match_terms_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."match_terms"
    ADD CONSTRAINT "match_terms_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."match_terms"
    ADD CONSTRAINT "match_terms_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_joey_id_fkey" FOREIGN KEY ("joey_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_lines"
    ADD CONSTRAINT "payment_lines_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."payment_lines"
    ADD CONSTRAINT "payment_lines_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_lines"
    ADD CONSTRAINT "payment_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."payment_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."payment_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."timecards"
    ADD CONSTRAINT "timecards_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."timecards"
    ADD CONSTRAINT "timecards_joey_id_fkey" FOREIGN KEY ("joey_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."timecards"
    ADD CONSTRAINT "timecards_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."timecards"
    ADD CONSTRAINT "timecards_payroll_line_id_fkey" FOREIGN KEY ("payroll_line_id") REFERENCES "public"."payment_lines"("id") ON DELETE SET NULL;



ALTER TABLE "public"."agreement_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agreement_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agreement_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agreements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anyone signed in reads stages" ON "public"."application_stages" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."application_stage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."application_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."esign_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fee_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "host reads non-drafts" ON "public"."timecards" FOR SELECT USING ((("host_id" = "auth"."uid"()) AND ("status" <> 'draft'::"public"."timecard_status")));



CREATE POLICY "host reads own fees" ON "public"."host_fees" FOR SELECT USING (("host_id" = "auth"."uid"()));



ALTER TABLE "public"."host_fees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hosts read fees" ON "public"."fee_schedule" FOR SELECT USING (("public"."my_role"() = 'host'::"public"."user_role"));



CREATE POLICY "joey adds references" ON "public"."joey_references" FOR INSERT WITH CHECK ((("joey_id" = "auth"."uid"()) AND "public"."joey_can_edit_references"("auth"."uid"())));



CREATE POLICY "joey creates on open match" ON "public"."timecards" FOR INSERT WITH CHECK ((("joey_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['draft'::"public"."timecard_status", 'submitted'::"public"."timecard_status"])) AND (EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE (("m"."id" = "timecards"."match_id") AND ("m"."joey_id" = "auth"."uid"()) AND ("m"."host_id" = "timecards"."host_id") AND ("m"."ended_at" IS NULL))))));



CREATE POLICY "joey deletes drafts" ON "public"."timecards" FOR DELETE USING ((("joey_id" = "auth"."uid"()) AND ("status" = 'draft'::"public"."timecard_status")));



CREATE POLICY "joey edits own draft" ON "public"."joey_applications" FOR UPDATE USING ((("joey_id" = "auth"."uid"()) AND ("status" = 'draft'::"public"."application_status"))) WITH CHECK ((("joey_id" = "auth"."uid"()) AND ("status" = 'draft'::"public"."application_status")));



CREATE POLICY "joey edits references" ON "public"."joey_references" FOR UPDATE USING ((("joey_id" = "auth"."uid"()) AND "public"."joey_can_edit_references"("auth"."uid"()))) WITH CHECK (("joey_id" = "auth"."uid"()));



CREATE POLICY "joey edits unapproved" ON "public"."timecards" FOR UPDATE USING ((("joey_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['draft'::"public"."timecard_status", 'submitted'::"public"."timecard_status", 'rejected'::"public"."timecard_status"])))) WITH CHECK ((("joey_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['draft'::"public"."timecard_status", 'submitted'::"public"."timecard_status"]))));



CREATE POLICY "joey reads own" ON "public"."timecards" FOR SELECT USING (("joey_id" = "auth"."uid"()));



CREATE POLICY "joey reads own application" ON "public"."joey_applications" FOR SELECT USING (("joey_id" = "auth"."uid"()));



CREATE POLICY "joey reads own references" ON "public"."joey_references" FOR SELECT USING (("joey_id" = "auth"."uid"()));



CREATE POLICY "joey reads own stage history" ON "public"."application_stage_events" FOR SELECT USING (("joey_id" = "auth"."uid"()));



CREATE POLICY "joey removes references" ON "public"."joey_references" FOR DELETE USING ((("joey_id" = "auth"."uid"()) AND "public"."joey_can_edit_references"("auth"."uid"())));



ALTER TABLE "public"."joey_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."joey_references" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parties read agreements" ON "public"."agreements" FOR SELECT TO "authenticated" USING ("public"."can_see_agreement"("id"));



CREATE POLICY "parties read events" ON "public"."agreement_events" FOR SELECT TO "authenticated" USING ("public"."can_see_agreement"("agreement_id"));



CREATE POLICY "parties read signatures" ON "public"."agreement_signatures" FOR SELECT TO "authenticated" USING ("public"."can_see_agreement"("agreement_id"));



CREATE POLICY "parties read terms" ON "public"."match_terms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE (("m"."id" = "match_terms"."match_id") AND (("auth"."uid"() = "m"."host_id") OR ("auth"."uid"() = "m"."joey_id"))))));



CREATE POLICY "parties read versions" ON "public"."agreement_versions" FOR SELECT TO "authenticated" USING ("public"."can_see_agreement"("agreement_id"));



ALTER TABLE "public"."payment_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read matched profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE ((("m"."host_id" = "auth"."uid"()) AND ("m"."joey_id" = "profiles"."id")) OR (("m"."joey_id" = "auth"."uid"()) AND ("m"."host_id" = "profiles"."id"))))));



CREATE POLICY "read own consents" ON "public"."esign_consents" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "read own lines" ON "public"."payment_lines" FOR SELECT USING (("party_id" = "auth"."uid"()));



CREATE POLICY "read own payments" ON "public"."payments" FOR SELECT USING (("party_id" = "auth"."uid"()));



CREATE POLICY "read own profile" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "read runs you're in" ON "public"."payment_runs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."payment_lines" "l"
  WHERE (("l"."run_id" = "payment_runs"."id") AND ("l"."party_id" = "auth"."uid"())))));



CREATE POLICY "see own matches" ON "public"."matches" FOR SELECT USING ((("host_id" = "auth"."uid"()) OR ("joey_id" = "auth"."uid"())));



ALTER TABLE "public"."sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timecards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update own profile" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."add_joey"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_joey"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_joey"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_create"("p_actor" "uuid", "p_kind" "public"."agreement_kind", "p_match" "uuid", "p_fields" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_create"("p_actor" "uuid", "p_kind" "public"."agreement_kind", "p_match" "uuid", "p_fields" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_log"("p_id" "uuid", "p_version" integer, "p_actor" "uuid", "p_action" "text", "p_comment" "text", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_log"("p_id" "uuid", "p_version" integer, "p_actor" "uuid", "p_action" "text", "p_comment" "text", "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_mark_viewed"("p_actor" "uuid", "p_id" "uuid", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_mark_viewed"("p_actor" "uuid", "p_id" "uuid", "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_record_terms"("p_match" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_record_terms"("p_match" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_request_changes"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_request_changes"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_save_draft"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_save_draft"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_send"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_ends_on" "date", "p_note" "text", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_send"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_ends_on" "date", "p_note" "text", "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_sign"("p_actor" "uuid", "p_id" "uuid", "p_version" integer, "p_hash" "text", "p_typed_name" "text", "p_addendum_ack" boolean, "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_sign"("p_actor" "uuid", "p_id" "uuid", "p_version" integer, "p_hash" "text", "p_typed_name" "text", "p_addendum_ack" boolean, "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_sign_host_services"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_typed_name" "text", "p_joeyco_name" "text", "p_joeyco_title" "text", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_sign_host_services"("p_actor" "uuid", "p_id" "uuid", "p_fields" "jsonb", "p_rendered" "jsonb", "p_hash" "text", "p_template_version" "text", "p_typed_name" "text", "p_joeyco_name" "text", "p_joeyco_title" "text", "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agreement_void"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agreement_void"("p_actor" "uuid", "p_id" "uuid", "p_comment" "text", "p_ip" "text", "p_ua" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."application_missing"("p_joey" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."application_missing"("p_joey" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_clarify_stage"("p_joey" "uuid", "p_clarify_value" "text", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_clarify_stage"("p_joey" "uuid", "p_clarify_value" "text", "p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_payment_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_payment_run"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."billing_tz"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."billing_tz"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_see_agreement"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_see_agreement"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_see_agreement"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."charge_application_fee"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."charge_application_fee"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."charge_match_fee"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."charge_match_fee"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."days_without_terms"("p_match_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."days_without_terms"("p_match_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."display_name"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."display_name"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_match"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_match"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."joey_applications" TO "service_role";
GRANT SELECT ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("first_name") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("last_name") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("date_of_birth") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("work_authorized") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("school_degree") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("preferred_cities") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("move_in_timing") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("services") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("why_joey") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("heard_about") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("conduct_signature") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("news_opt_in") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("host_preference") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("bg_disclosure_signature") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("bg_disclosure_version") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("ca_disclosure_signature") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("ca_disclosure_version") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("ca_report_copy_requested") ON TABLE "public"."joey_applications" TO "authenticated";



GRANT UPDATE("conduct_version") ON TABLE "public"."joey_applications" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_my_application"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_my_application"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_my_application"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fee_amount"("p_code" "public"."fee_code", "p_on" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fee_amount"("p_code" "public"."fee_code", "p_on" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_due_payment_runs"("p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_due_payment_runs"("p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_host_monthly_run"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_host_monthly_run"("p_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_payroll_run"("p_period_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_payroll_run"("p_period_start" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."give_esign_consent"("p_actor" "uuid", "p_version" "text", "p_ip" "text", "p_ua" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."give_esign_consent"("p_actor" "uuid", "p_version" "text", "p_ip" "text", "p_ua" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."joey_applications_before_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."joey_applications_before_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."joey_applications_before_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."joey_can_edit_references"("p_joey" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."joey_can_edit_references"("p_joey" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."joey_can_edit_references"("p_joey" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."joey_references_after_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."joey_references_after_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."joey_references_after_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_locked_through"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_locked_through"("p_match_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."matches" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



REVOKE ALL ON FUNCTION "public"."matches_active_between"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."matches_active_between"("p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_application_missing"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_application_missing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_application_missing"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."net_run_payments"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."net_run_payments"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."propose_terms"("p_match_id" "uuid", "p_effective_date" "date", "p_hourly_rate_cents" integer, "p_monthly_rent_cents" integer, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."propose_terms"("p_match_id" "uuid", "p_effective_date" "date", "p_hourly_rate_cents" integer, "p_monthly_rent_cents" integer, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."propose_terms"("p_match_id" "uuid", "p_effective_date" "date", "p_hourly_rate_cents" integer, "p_monthly_rent_cents" integer, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."regenerate_payment_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_payment_run"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rent_for_range"("p_match_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rent_for_range"("p_match_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_terms"("p_terms_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_terms"("p_terms_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_terms"("p_terms_id" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_timecard"("p_id" "uuid", "p_decision" "public"."timecard_status", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_timecard"("p_id" "uuid", "p_decision" "public"."timecard_status", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_timecard"("p_id" "uuid", "p_decision" "public"."timecard_status", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_my_role"("p_role" "public"."user_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_role"("p_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_role"("p_role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_disclosure_signatures"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_disclosure_signatures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_disclosure_signatures"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_my_application"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_my_application"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_my_application"() TO "service_role";



GRANT ALL ON TABLE "public"."match_terms" TO "service_role";
GRANT SELECT ON TABLE "public"."match_terms" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."terms_on"("p_match_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."terms_on"("p_match_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."timecards_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."timecards_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."timecards_touch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."void_payment_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."void_payment_run"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."withdraw_terms"("p_terms_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."withdraw_terms"("p_terms_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_terms"("p_terms_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."agreement_events" TO "service_role";
GRANT SELECT ON TABLE "public"."agreement_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."agreement_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agreement_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agreement_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agreement_signatures" TO "service_role";
GRANT SELECT ON TABLE "public"."agreement_signatures" TO "authenticated";



GRANT ALL ON TABLE "public"."agreement_versions" TO "service_role";
GRANT SELECT ON TABLE "public"."agreement_versions" TO "authenticated";



GRANT ALL ON TABLE "public"."agreements" TO "service_role";
GRANT SELECT ON TABLE "public"."agreements" TO "authenticated";



GRANT ALL ON TABLE "public"."application_stage_events" TO "service_role";
GRANT SELECT ON TABLE "public"."application_stage_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."application_stage_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."application_stage_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."application_stage_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."application_stages" TO "service_role";
GRANT SELECT ON TABLE "public"."application_stages" TO "authenticated";



GRANT ALL ON TABLE "public"."billing_settings" TO "service_role";



GRANT ALL ON TABLE "public"."esign_consents" TO "service_role";
GRANT SELECT ON TABLE "public"."esign_consents" TO "authenticated";



GRANT ALL ON TABLE "public"."fee_schedule" TO "service_role";
GRANT SELECT ON TABLE "public"."fee_schedule" TO "authenticated";



GRANT ALL ON TABLE "public"."host_fees" TO "service_role";
GRANT SELECT ON TABLE "public"."host_fees" TO "authenticated";



GRANT ALL ON TABLE "public"."joey_references" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("joey_id") ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("full_name"),UPDATE("full_name") ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("relationship"),UPDATE("relationship") ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("email"),UPDATE("email") ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("phone"),UPDATE("phone") ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("known_for"),UPDATE("known_for") ON TABLE "public"."joey_references" TO "authenticated";



GRANT INSERT("reference_type"),UPDATE("reference_type") ON TABLE "public"."joey_references" TO "authenticated";



GRANT ALL ON TABLE "public"."payment_lines" TO "service_role";
GRANT SELECT ON TABLE "public"."payment_lines" TO "authenticated";



GRANT ALL ON TABLE "public"."payment_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."payment_runs" TO "authenticated";



GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT SELECT ON TABLE "public"."payments" TO "authenticated";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."sync_state" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."timecards" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."timecards" TO "authenticated";
GRANT ALL ON TABLE "public"."timecards" TO "service_role";



GRANT INSERT("match_id") ON TABLE "public"."timecards" TO "authenticated";



GRANT INSERT("joey_id") ON TABLE "public"."timecards" TO "authenticated";



GRANT INSERT("host_id") ON TABLE "public"."timecards" TO "authenticated";



GRANT INSERT("work_date"),UPDATE("work_date") ON TABLE "public"."timecards" TO "authenticated";



GRANT INSERT("hours"),UPDATE("hours") ON TABLE "public"."timecards" TO "authenticated";



GRANT INSERT("notes"),UPDATE("notes") ON TABLE "public"."timecards" TO "authenticated";



GRANT INSERT("status"),UPDATE("status") ON TABLE "public"."timecards" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ─────────────────────────────────────────────
-- Added by hand
-- ─────────────────────────────────────────────

-- New sign-ups get a profile (lives on auth.users, so it isn't in the public-schema export).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Config the app needs: application stages (and their Clarify stage mapping), fees, billing settings.
insert into public.application_stages select * from jsonb_populate_recordset(null::public.application_stages, $cfg$[{"key": "draft", "owner": "joey", "title": "Finish your application", "on_path": true, "sort_order": 10, "owner_label": "You", "joey_message": "Your answers save as you go. Submit once every section is complete.", "clarify_values": [], "typical_duration": null, "joey_can_edit_references": true}, {"key": "in_review", "owner": "joeyco", "title": "Application review", "on_path": true, "sort_order": 20, "owner_label": "JoeyCo", "joey_message": "We're reading your application. Nothing is needed from you right now.", "clarify_values": ["Assignment", "Scheduling + Intro Call"], "typical_duration": "3–5 business days", "joey_can_edit_references": true}, {"key": "reference_check", "owner": "references", "title": "Reference check", "on_path": true, "sort_order": 30, "owner_label": "Your references", "joey_message": "We've reached out to the references you listed. A quick text letting them know to expect us helps this go faster.", "clarify_values": ["Screening"], "typical_duration": "About a week", "joey_can_edit_references": false}, {"key": "background_check", "owner": "vendor", "title": "Background check", "on_path": true, "sort_order": 40, "owner_label": "You, then our screening partner", "joey_message": "Watch your inbox for an email from our screening partner asking for your consent. You complete this step on their site, not in the portal, and the results come back to JoeyCo.", "clarify_values": [], "typical_duration": "2–5 business days after you consent", "joey_can_edit_references": false}, {"key": "approved", "owner": "joeyco", "title": "Finding your Host", "on_path": true, "sort_order": 50, "owner_label": "JoeyCo", "joey_message": "You're approved. We're looking for a Host who fits your cities, timing, and the help you offer, and we'll reach out before any introduction.", "clarify_values": ["Match Ready"], "typical_duration": "Varies by city", "joey_can_edit_references": false}, {"key": "matched", "owner": "host", "title": "Matched", "on_path": true, "sort_order": 60, "owner_label": "You and your Host", "joey_message": "You're matched with a Host. Timecards and payments unlock in your portal.", "clarify_values": ["Matched", "Completed"], "typical_duration": null, "joey_can_edit_references": false}, {"key": "on_hold", "owner": "joeyco", "title": "Application paused", "on_path": false, "sort_order": 90, "owner_label": "JoeyCo", "joey_message": "We've paused your application. We'll email you with what's needed or when things pick up in your cities.", "clarify_values": ["Keep Warm", "Inactive"], "typical_duration": null, "joey_can_edit_references": false}, {"key": "not_moving_forward", "owner": "joeyco", "title": "Application closed", "on_path": false, "sort_order": 95, "owner_label": "JoeyCo", "joey_message": "We're not able to move forward right now. Check your email for details.", "clarify_values": ["Rejected", "Suspected Spam / Bot"], "typical_duration": null, "joey_can_edit_references": false}]$cfg$::jsonb)
  on conflict do nothing;
insert into public.fee_schedule select * from jsonb_populate_recordset(null::public.fee_schedule, $cfg$[{"id": "5bf11518-2dc2-433d-a3ea-2f2fe5f2180c", "code": "application", "created_at": "2026-11-06T17:14:12.519569+00:00", "amount_cents": 0, "effective_date": "2026-01-01"}, {"id": "7112178a-aeef-4e34-860a-8b4ccd0170d5", "code": "match", "created_at": "2026-11-06T17:14:12.519569+00:00", "amount_cents": 0, "effective_date": "2026-01-01"}, {"id": "c58e963d-f0af-4e1b-a5b6-99b1ad26f555", "code": "service_monthly", "created_at": "2026-11-06T17:14:12.519569+00:00", "amount_cents": 0, "effective_date": "2026-01-01"}]$cfg$::jsonb)
  on conflict do nothing;
insert into public.billing_settings select * from jsonb_populate_recordset(null::public.billing_settings, $cfg$[{"id": true, "timezone": "America/Denver", "updated_at": "2026-11-06T17:14:12.519569+00:00", "payroll_anchor": "2026-11-16", "host_billing_start": "2026-12-01", "host_run_lead_days": 0, "payday_offset_days": 5, "payroll_run_delay_days": 2}]$cfg$::jsonb)
  on conflict do nothing;
