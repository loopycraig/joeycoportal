-- JoeyCo's fees to the Host, as Exhibit A of the Host Services Agreement sets them:
--   Search fee: $500, once per Host, charged when they become a Host.
--   Match fee:  one month's rent (the signed housing license's monthly rent), once per match.
--               Charged when the housing license is signed, due on its move-in day (the early
--               move-in date or the start date). If the Host's first match comes more than a year
--               after their search fee, the search fee is credited against it (Section 3.3).
--   Service fee: $299 a month per Host while they have a Joey housed, from move-in day (as for the
--               match fee) to move-out, prorated by day for a partial month. Billed in advance on
--               the 1st; a Joey who moves in after that month's run is caught up on the next one.
--
-- The search fee goes out in a "host_fee" run the day it's incurred, the match fee in its own
-- "host_fee" run made at signing and due on move-in day, and the service fee in the monthly run on
-- the 1st.

-- Runs are approved as soon as they're created: there's no draft step for JoeyCo to review.

insert into public.fee_schedule (code, amount_cents, effective_date) values
  ('application', 50000, date '2026-11-14'),
  ('service_monthly', 29900, date '2026-11-14')
on conflict (code, effective_date) do update set amount_cents = excluded.amount_cents;
-- The match fee is the match's rent, so fee_schedule's 'match' amount is no longer used.

-- Move-in day: the signed housing license's early move-in date or start date, else the match's
-- first day.
create or replace function public.match_move_in_day(p_match uuid) returns date
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(case when v.fields->>'move_in_mode' = 'early' then nullif(v.fields->>'early_move_in_date', '')::date end,
                    nullif(v.fields->>'term_start', '')::date)
      from public.agreements a
      join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
     where a.match_id = p_match and a.kind = 'housing_license' and a.status = 'executed'
     order by a.executed_at desc limit 1),
    (select (m.started_at at time zone public.billing_tz())::date from public.matches m where m.id = p_match))
$$;

-- The service fee a Host owes for a month: the monthly fee times the share of the month's days on
-- which any of their Joeys was housed (from move-in day to the night before move-out).
create or replace function public.host_service_fee(p_host uuid, p_month date) returns integer
  language sql stable security definer set search_path = public as $$
  with mo as (
    select date_trunc('month', p_month)::date as ms,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as me
  ), days as (
    select distinct d::date as d
      from mo, public.matches m
     cross join lateral public.match_rent_bounds(m.id) b
     cross join lateral generate_series(greatest(mo.ms, public.match_move_in_day(m.id)),
                                        least(mo.me, coalesce(b.housing_end, 'infinity'::date)),
                                        interval '1 day') d
     where m.host_id = p_host
       and (m.ended_at is null or m.ended_at > m.started_at)
  )
  select coalesce(round(public.fee_amount('service_monthly', mo.ms)::numeric
                        * (select count(*) from days) / extract(day from mo.me))::integer, 0)
    from mo
$$;

create or replace function public.generate_host_monthly_run(p_month date) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  s        public.billing_settings;
  v_ms     date := date_trunc('month', p_month)::date;
  v_me     date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_prev   date := (date_trunc('month', p_month) - interval '1 month')::date;
  v_full   integer;
  v_run    uuid;
  v_amt    int;
  r        record;
begin
  select * into s from public.billing_settings;
  if v_ms < s.host_billing_start then
    raise exception 'Host billing starts %', s.host_billing_start;
  end if;

  insert into public.payment_runs (kind, period_start, period_end, pay_date)
  values ('host_monthly', v_ms, v_me, v_ms)
  returning id into v_run;

  -- Service fee, per Host: this month in advance, plus anything still owed for last month (a
  -- Joey who moved in after last month's run).
  v_full := public.fee_amount('service_monthly', v_ms);
  for r in
    select distinct m.host_id from public.matches m
     where (m.ended_at is null or m.ended_at > m.started_at)
       and (m.started_at at time zone public.billing_tz())::date <= v_me
  loop
    if v_prev >= s.host_billing_start then
      v_amt := public.host_service_fee(r.host_id, v_prev) - coalesce((
        select sum(-l.amount_cents) from public.payment_lines l
         where l.party_id = r.host_id and l.kind = 'service_fee'
           and l.service_start >= v_prev and l.service_start < v_ms), 0);
      if v_amt > 0 then
        insert into public.payment_lines (run_id, party_id, kind, description, service_start, service_end, amount_cents)
        values (v_run, r.host_id, 'service_fee',
                format('JoeyCo service fee, %s (from move-in)', to_char(v_prev, 'FMMonth YYYY')),
                v_prev, v_ms - 1, -v_amt);
      end if;
    end if;

    v_amt := public.host_service_fee(r.host_id, v_ms);
    if v_amt > 0 then
      insert into public.payment_lines (run_id, party_id, kind, description, service_start, service_end, amount_cents)
      values (v_run, r.host_id, 'service_fee',
              format('JoeyCo service fee, %s%s', to_char(v_ms, 'FMMonth YYYY'),
                     case when v_amt < v_full then ' (prorated)' else '' end),
              v_ms, v_me, -v_amt);
    end if;
  end loop;

  perform public.net_run_payments(v_run);
  -- Fee runs go out without JoeyCo reviewing them: approved as soon as they're made, so the same
  -- cron run that creates one sends its payments.
  update public.payment_runs set status = 'approved', approved_at = now() where id = v_run;
  return v_run;
end $$;

-- Several one-time fee runs can share a day (one per signed license), so the one-run-per-day rule
-- applies only to the other kinds.
alter table public.payment_runs drop constraint if exists payment_runs_kind_period_start_key;
create unique index if not exists payment_runs_kind_period_start_key on public.payment_runs (kind, period_start)
  where kind <> 'host_fee';

-- The match fee, when a housing license is signed: one month's rent from the license, as a charge
-- to the Host due on the license's move-in day (not before host billing starts). Approved as it's
-- made, so the daily job sends it once that day comes. Nothing for an "other" rent arrangement.
create or replace function public.charge_match_fee_for_license(p_agreement uuid) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  a        public.agreements;
  f        jsonb;
  fee      public.host_fees;
  s        public.billing_settings;
  v_rent   integer;
  v_due    date;
  v_credit integer;
  v_run    uuid;
  v_line   uuid;
begin
  select * into a from public.agreements where id = p_agreement and kind = 'housing_license' and status = 'executed';
  if not found or a.match_id is null then return null; end if;
  select v.fields into f from public.agreement_versions v where v.agreement_id = a.id and v.version = a.current_version;
  v_rent := case when f->>'rent_mode' = 'amount' then nullif(f->>'rent_cents', '')::integer end;
  if coalesce(v_rent, 0) <= 0 then return null; end if;

  select * into fee from public.host_fees
   where match_id = a.match_id and code = 'match' and not waived and payment_line_id is null
   for update;
  if not found then return null; end if;  -- already charged (or waived)

  select * into s from public.billing_settings;
  v_due := greatest(public.match_move_in_day(a.match_id), s.host_billing_start);

  -- Search fee credit: the Host's first match, more than a year after their search fee.
  select coalesce(sum(x.amount_cents), 0)::int into v_credit
    from public.host_fees x
   where x.host_id = fee.host_id and x.code = 'application' and not x.waived
     and x.incurred_on + interval '1 year' <= fee.incurred_on
     and not exists (select 1 from public.host_fees o
                      where o.host_id = fee.host_id and o.code = 'match' and o.id <> fee.id
                        and o.incurred_on <= fee.incurred_on);
  v_rent := greatest(v_rent - v_credit, 0);
  if v_rent = 0 then
    update public.host_fees set amount_cents = 0 where id = fee.id;
    return null;
  end if;

  insert into public.payment_runs (kind, period_start, period_end, pay_date)
  values ('host_fee', v_due, v_due, v_due)
  returning id into v_run;
  insert into public.payment_lines (run_id, party_id, match_id, kind, description, service_start, amount_cents)
  values (v_run, fee.host_id, fee.match_id, 'match_fee',
          format('Match fee (one month''s rent), %s, due on move-in %s%s',
                 public.display_name((select joey_id from public.matches where id = fee.match_id)),
                 to_char(v_due, 'FMMon FMDD'),
                 case when v_credit > 0 then ', less search fee credit' else '' end),
          v_due, -v_rent)
  returning id into v_line;
  update public.host_fees set amount_cents = v_rent, incurred_on = v_due, payment_line_id = v_line where id = fee.id;
  perform public.net_run_payments(v_run);
  update public.payment_runs set status = 'approved', approved_at = now() where id = v_run;
  return v_run;
end $$;

create or replace function public.agreements_after_execute() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.charge_match_fee_for_license(new.id);
  return null;
end $$;

drop trigger if exists charge_match_fee_on_license on public.agreements;
create trigger charge_match_fee_on_license
  after insert or update of status on public.agreements
  for each row
  when (new.kind = 'housing_license' and new.status = 'executed')
  execute function public.agreements_after_execute();

-- Search fees incurred by today and not yet charged, in one run for the day. Null if none.
create or replace function public.generate_host_fee_run(p_day date) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_run  uuid;
  v_line uuid;
  r      record;
begin
  for r in
    select * from public.host_fees
     where code = 'application' and payment_line_id is null and not waived
       and amount_cents > 0 and incurred_on <= p_day
     order by incurred_on
  loop
    if v_run is null then
      insert into public.payment_runs (kind, period_start, period_end, pay_date)
      values ('host_fee', p_day, p_day, p_day)
      returning id into v_run;
    end if;
    insert into public.payment_lines (run_id, party_id, kind, description, service_start, amount_cents)
    values (v_run, r.host_id, 'application_fee', 'Search fee', r.incurred_on, -r.amount_cents)
    returning id into v_line;
    update public.host_fees set payment_line_id = v_line where id = r.id;
  end loop;

  if v_run is null then return null; end if;
  perform public.net_run_payments(v_run);
  update public.payment_runs set status = 'approved', approved_at = now() where id = v_run;
  return v_run;
end $$;

-- Licenses already signed whose match fee hasn't been charged.
select public.charge_match_fee_for_license(a.id)
  from public.agreements a join public.matches m on m.id = a.match_id
 where a.kind = 'housing_license' and a.status = 'executed' and m.ended_at is null;

-- Daily: the monthly service fee run on the 1st, and any search fees incurred.
create or replace function public.generate_due_payment_runs(p_today date default null) returns setof uuid
  language plpgsql security definer set search_path = public as $$
declare
  s        public.billing_settings;
  v_today  date;
  v_d      date;
  v_run    uuid;
begin
  select * into s from public.billing_settings;
  v_today := coalesce(p_today, (now() at time zone s.timezone)::date);
  v_d := s.host_billing_start;
  while v_d - s.host_run_lead_days <= v_today loop
    if not exists (select 1 from public.payment_runs where kind = 'host_monthly' and period_start = v_d) then
      return next public.generate_host_monthly_run(v_d);
    end if;
    v_d := (v_d + interval '1 month')::date;
  end loop;

  if v_today >= s.host_billing_start then
    v_run := public.generate_host_fee_run(v_today);
    if v_run is not null then return next v_run; end if;
  end if;
end $$;

revoke all on function public.match_move_in_day(uuid) from public, anon, authenticated;
revoke all on function public.host_service_fee(uuid, date) from public, anon, authenticated;
revoke all on function public.generate_host_monthly_run(date) from public, anon, authenticated;
revoke all on function public.charge_match_fee_for_license(uuid) from public, anon, authenticated;
revoke all on function public.agreements_after_execute() from public, anon, authenticated;
revoke all on function public.generate_host_fee_run(date) from public, anon, authenticated;
revoke all on function public.generate_due_payment_runs(date) from public, anon, authenticated;
