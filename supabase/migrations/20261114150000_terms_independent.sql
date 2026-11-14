-- The hourly rate and the rent are recorded independently. Before, nothing was recorded until both
-- the offer letter and the housing license were signed, so a match with only a signed offer letter
-- showed no hourly rate at all.
--
-- A match_terms row can now have a rate and no rent yet, or the other way round. Each new row
-- carries over whichever value is already in force, and fills in later rows that were missing it.
-- Rent billing already treats a missing rent as "no agreed rent" (it warns and charges nothing).

alter table public.match_terms
  alter column hourly_rate_cents drop not null,
  alter column monthly_rent_cents drop not null,
  add constraint match_terms_has_a_value check (hourly_rate_cents is not null or monthly_rent_cents is not null);

-- Records a rate and/or rent from a date (pushed past anything already in payroll). Does nothing
-- when that value is already in force. Returns whether it recorded anything.
create or replace function public.record_terms_value(
  p_match uuid, p_from date, p_rate integer, p_rent integer, p_note text
) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  m       public.matches;
  cur     public.match_terms;
  v_lock  date;
  v_from  date := p_from;
begin
  if p_rate is null and p_rent is null then return false; end if;
  select * into m from public.matches where id = p_match;
  v_lock := public.match_locked_through(p_match);
  if v_lock is not null and v_from <= v_lock then v_from := v_lock + 1; end if;

  select * into cur from public.terms_on(p_match, v_from);
  if cur.id is not null
     and (p_rate is null or cur.hourly_rate_cents is not distinct from p_rate)
     and (p_rent is null or cur.monthly_rent_cents is not distinct from p_rent) then
    return false;
  end if;

  update public.match_terms set status = 'superseded'
   where match_id = p_match and status = 'accepted' and effective_date = v_from;
  insert into public.match_terms
    (match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, note, proposed_by, proposed_at, responded_by, responded_at)
  values
    (p_match, v_from, coalesce(p_rate, cur.hourly_rate_cents), coalesce(p_rent, cur.monthly_rent_cents),
     'accepted', p_note, m.host_id, now(), m.joey_id, now());

  -- Later rows recorded before this value existed get it too.
  if p_rate is not null then
    update public.match_terms set hourly_rate_cents = p_rate
     where match_id = p_match and status = 'accepted' and effective_date > v_from and hourly_rate_cents is null;
  end if;
  if p_rent is not null then
    update public.match_terms set monthly_rent_cents = p_rent
     where match_id = p_match and status = 'accepted' and effective_date > v_from and monthly_rent_cents is null;
  end if;
  return true;
end $$;

-- From the signed offer letter (rate from its start date) and housing license (rent from its term
-- start), each on its own. Safe to call any number of times.
create or replace function public.agreement_record_terms(p_match uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  m         public.matches;
  v_offer   jsonb;
  v_license jsonb;
  v_start   date;
  v_rate    integer;
  v_rent    integer;
begin
  select * into m from public.matches where id = p_match and ended_at is null;
  if not found then return 'match_ended'; end if;
  v_start := (m.started_at at time zone public.billing_tz())::date;

  select v.fields into v_offer from public.agreements a
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.match_id = p_match and a.kind = 'offer_letter' and a.status = 'executed'
   order by a.executed_at desc limit 1;
  select v.fields into v_license from public.agreements a
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.match_id = p_match and a.kind = 'housing_license' and a.status = 'executed'
   order by a.executed_at desc limit 1;
  if v_offer is null and v_license is null then return 'waiting'; end if;

  v_rate := nullif(v_offer->>'hourly_rate_cents', '')::integer;
  if v_rate is not null then
    perform public.record_terms_value(p_match, coalesce(nullif(v_offer->>'start_date', '')::date, v_start),
                                      v_rate, null, 'From the signed offer letter');
  end if;

  v_rent := case when v_license->>'rent_mode' = 'amount' then nullif(v_license->>'rent_cents', '')::integer end;
  if v_rent is not null then
    perform public.record_terms_value(p_match, coalesce(nullif(v_license->>'term_start', '')::date, v_start),
                                      null, v_rent, 'From the signed housing license');
  end if;
  return 'recorded';
end $$;

-- Amendments change one value and keep the other.
create or replace function public.agreement_record_amendment(p_id uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  a       public.agreements;
  f       jsonb;
  v_eff   date;
  v_lock  date;
  v_new   integer;
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

  v_new := nullif(f->>case a.kind when 'pay_amendment' then 'new_rate_cents' else 'new_rent_cents' end, '')::integer;
  if v_new is null then raise exception 'This amendment is missing the new amount'; end if;

  perform public.record_terms_value(
    a.match_id, v_eff,
    case when a.kind = 'pay_amendment' then v_new end,
    case when a.kind = 'rent_amendment' then v_new end,
    case a.kind when 'pay_amendment' then 'From the signed pay rate amendment' else 'From the signed rent amendment' end);
  return 'recorded';
end $$;

-- Rent warnings count days with no agreed rent, including days that only have a rate.
create or replace function public.days_without_terms(p_match_id uuid, p_from date, p_to date) returns integer
  language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.matches m
   cross join lateral generate_series(
           greatest(p_from, (m.started_at at time zone public.billing_tz())::date),
           least(p_to, coalesce((m.ended_at at time zone public.billing_tz())::date - 1, p_to)),
           interval '1 day') d
   where m.id = p_match_id
     and not exists (select 1 from public.terms_on(m.id, d::date) t where t.monthly_rent_cents is not null)
$$;

revoke all on function public.record_terms_value(uuid, date, integer, integer, text) from public, anon, authenticated;

-- Matches with a signed offer letter or housing license but nothing recorded yet.
select public.agreement_record_terms(id) from public.matches where ended_at is null;
