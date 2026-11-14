-- Rate and rent changes are signed amendments; pay schedule changes are written notices.
--
-- * pay_amendment / rent_amendment: drafted by the Host, signed by the Joey, countersigned by the
--   Host like any agreement. When it's signed by both, the new rate or rent goes into match_terms
--   from its effective date (agreement_record_amendment).
-- * pay_schedule_notice / termination_notice: issued when the Host changes the pay schedule or ends
--   the match. Nothing to sign; the Joey acknowledges it (agreement_acknowledge).
-- * A schedule change now starts with the first pay period that begins at least 7 days out.

-- ---------------------------------------------------------------------------
-- Amendments take effect
-- ---------------------------------------------------------------------------

create or replace function public.agreement_record_amendment(p_id uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  a       public.agreements;
  f       jsonb;
  v_eff   date;
  v_lock  date;
  cur     public.match_terms;
  v_rate  integer;
  v_rent  integer;
begin
  select * into a from public.agreements where id = p_id;
  select fields into f from public.agreement_versions where agreement_id = p_id and version = a.current_version;
  v_eff := nullif(f->>'effective_date', '')::date;
  if v_eff is null then raise exception 'This amendment has no start date'; end if;

  v_lock := public.match_locked_through(a.match_id);
  if v_lock is not null and v_eff <= v_lock then
    raise exception 'Pay through % is already in payroll, so this change can''t start on %. Send a new version with a later start date.',
      to_char(v_lock, 'Mon FMDD'), to_char(v_eff, 'Mon FMDD');
  end if;

  select * into cur from public.terms_on(a.match_id, v_eff);
  if cur.id is null then raise exception 'There are no agreed terms on that date to change'; end if;

  v_rate := case when a.kind = 'pay_amendment' then nullif(f->>'new_rate_cents', '')::integer else cur.hourly_rate_cents end;
  v_rent := case when a.kind = 'rent_amendment' then nullif(f->>'new_rent_cents', '')::integer else cur.monthly_rent_cents end;
  if v_rate is null or v_rent is null then raise exception 'This amendment is missing the new amount'; end if;

  update public.match_terms set status = 'superseded'
   where match_id = a.match_id and status = 'accepted' and effective_date = v_eff;
  insert into public.match_terms
    (match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, note, proposed_by, proposed_at, responded_by, responded_at)
  values
    (a.match_id, v_eff, v_rate, v_rent, 'accepted',
     case a.kind when 'pay_amendment' then 'From the signed pay rate amendment' else 'From the signed rent amendment' end,
     a.host_id, now(), a.joey_id, now());
  return 'recorded';
end $$;

-- Same as before, except notices can't be signed and amendments record their own change.
create or replace function public.agreement_sign(
  p_actor uuid, p_id uuid, p_version integer, p_hash text, p_typed_name text, p_addendum_ack boolean, p_ip text, p_ua text
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  a public.agreements;
  v public.agreement_versions;
  v_party public.agreement_party;
begin
  if length(trim(coalesce(p_typed_name, ''))) < 2 then raise exception 'Type your full name to sign'; end if;
  select * into a from public.agreements where id = p_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if a.kind = 'host_services' then raise exception 'Use the Host Services Agreement signing step'; end if;
  if a.kind in ('pay_schedule_notice', 'termination_notice') then raise exception 'Notices are acknowledged, not signed'; end if;
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
  if a.kind in ('pay_amendment', 'rent_amendment') then
    perform public.agreement_record_amendment(p_id);
  else
    perform public.agreement_record_terms(a.match_id);
  end if;
  return 'executed';
end $$;

-- ---------------------------------------------------------------------------
-- Notices are acknowledged
-- ---------------------------------------------------------------------------

alter table public.agreement_events drop constraint agreement_events_action_check;
alter table public.agreement_events add constraint agreement_events_action_check check (action in
  ('created', 'sent', 'viewed', 'changes_requested', 'signed', 'countersigned', 'voided', 'executed', 'acknowledged'));

create or replace function public.agreement_acknowledge(p_actor uuid, p_id uuid, p_ip text, p_ua text) returns void
  language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_id for update;
  if not found or a.joey_id is distinct from p_actor or a.kind not in ('pay_schedule_notice', 'termination_notice') then
    raise exception 'Notice not found';
  end if;
  if a.status <> 'sent' then raise exception 'You''ve already acknowledged this notice'; end if;
  update public.agreements set status = 'executed', executed_at = now(), updated_at = now() where id = p_id;
  perform public.agreement_log(p_id, a.current_version, p_actor, 'acknowledged', null, p_ip, p_ua);
end $$;

revoke all on function public.agreement_acknowledge(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.agreement_record_amendment(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pay schedule changes give at least 7 days' notice
-- ---------------------------------------------------------------------------

create or replace function public.set_pay_schedule(
  p_match uuid, p_kind public.pay_schedule_kind, p_payday_offset integer default null
) returns date
  language plpgsql security definer set search_path = public as $$
declare
  v_today  date := public.local_today();
  v_from   date;
  v_anchor date;
  v_ids    uuid[];
begin
  if not exists (select 1 from public.matches
                  where id = p_match and host_id = auth.uid() and ended_at is null) then
    raise exception 'Match not found';
  end if;

  -- Periods that haven't started yet only hold time off requested ahead (they can't be in payroll):
  -- take their days out, rebuild the periods under the new schedule, and put the days back.
  select array_agg(t.id) into v_ids
    from public.time_entries t join public.pay_periods p on p.id = t.pay_period_id
   where p.match_id = p_match and p.period_start > v_today;
  update public.time_entries set pay_period_id = null where id = any(v_ids);
  delete from public.pay_periods where match_id = p_match and period_start > v_today;
  -- Any change already set for later is replaced.
  delete from public.pay_schedules where match_id = p_match and effective_from > v_today;

  -- The first pay period boundary at least 7 days from today.
  select period_end + 1 into v_from from public.pay_period_for(p_match, v_today);
  while v_from < v_today + 7 loop
    select period_end + 1 into v_from from public.pay_period_for(p_match, v_from);
  end loop;

  -- Weekly and biweekly periods run Monday to Sunday, the same as the workweek.
  if p_kind in ('weekly', 'biweekly') then
    v_anchor := v_from + ((8 - extract(isodow from v_from)::integer) % 7);
  end if;
  insert into public.pay_schedules (match_id, effective_from, kind, anchor_date, payday_offset_days, created_by)
  values (p_match, v_from, p_kind, v_anchor, coalesce(p_payday_offset, 5), auth.uid());

  update public.time_entries t
     set pay_period_id = (public.ensure_pay_period(t.match_id, t.work_date)).id
   where t.id = any(v_ids);
  return v_from;
end $$;

-- ---------------------------------------------------------------------------
-- Functions that take the actor as an argument are for the server only (lib/agreements/actions.ts
-- calls them with the service role after checking the session). Production already has these
-- revoked; the baseline dump didn't carry that over, so a fresh database needs it here.
-- ---------------------------------------------------------------------------

revoke execute on function public.agreement_create(uuid, public.agreement_kind, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.agreement_save_draft(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.agreement_send(uuid, uuid, jsonb, jsonb, text, text, date, text, text, text) from public, anon, authenticated;
revoke execute on function public.agreement_mark_viewed(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.agreement_request_changes(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.agreement_void(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.agreement_sign(uuid, uuid, integer, text, text, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.agreement_sign_host_services(uuid, uuid, jsonb, jsonb, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.give_esign_consent(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.agreement_record_terms(uuid) from public, anon, authenticated;
