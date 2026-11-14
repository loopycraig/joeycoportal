-- Rent is between the Joey and the Host, as the signed Housing License says: the Joey pays the Host
-- the monthly rent directly. The first month's rent is due on signing or on the first day of the
-- term (whichever the license picked), and each later month's on the license's due day. A 5% late
-- fee applies once rent is more than the license's number of days late. The Host marks each month
-- received. JoeyCo no longer advances rent to the Host or withholds it from the Joey.
--
-- A month's amount is the agreed rent (terms_on, so rent amendments apply), prorated by day for a
-- month the Joey is housed for only part of. It's frozen when the Host marks it received.
-- With no signed license (or one with an "other" rent arrangement) rent is due on the 1st, and
-- the first month on the match's first day, with no late fee.

create table public.rent_payments (
  match_id     uuid not null references public.matches(id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  amount_cents integer not null check (amount_cents >= 0),
  received_on  date not null,
  marked_by    uuid not null references public.profiles(id),
  marked_at    timestamptz not null default now(),
  primary key (match_id, month)
);
alter table public.rent_payments enable row level security;
-- Read and written only through the functions below.
revoke all on public.rent_payments from anon, authenticated;

-- The match's first day, and its last day of work if one is set (local dates).
create or replace function public.match_rent_bounds(p_match uuid, out first_day date, out last_work_day date, out housing_end date)
  language sql stable security definer set search_path = public as $$
  select (m.started_at at time zone public.billing_tz())::date,
         coalesce(m.employment_ends_on, (m.ended_at at time zone public.billing_tz())::date - 1),
         -- Rent runs to the night before move-out (as with ended_at).
         coalesce(m.housing_ends_on, (m.ended_at at time zone public.billing_tz())::date) - 1
    from public.matches m where m.id = p_match
$$;

-- Rent owed for one calendar month: agreed rent, prorated by day, for the days housed.
create or replace function public.match_rent_for_month(p_match uuid, p_month date) returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(t.monthly_rent_cents::numeric
                            / extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))))::integer, 0)
    from public.match_rent_bounds(p_match) b
   cross join lateral generate_series(
           greatest(date_trunc('month', p_month)::date, b.first_day),
           least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, coalesce(b.housing_end, 'infinity'::date)),
           interval '1 day') d
   cross join lateral public.terms_on(p_match, d::date) t
   where t.monthly_rent_cents is not null
$$;

-- The rent terms of the match's signed housing license, if it has one with a monthly amount.
create or replace function public.match_license_rent(
  p_match uuid, out executed_on date, out term_start date, out due_day integer, out first_rent text,
  out late_days integer, out payment_method text
)
  language sql stable security definer set search_path = public as $$
  select (a.executed_at at time zone public.billing_tz())::date,
         nullif(v.fields->>'term_start', '')::date,
         nullif(v.fields->>'rent_due_day', '')::integer,
         v.fields->>'first_rent',
         nullif(v.fields->>'late_days', '')::integer,
         nullif(trim(v.fields->>'payment_method'), '')
    from public.agreements a
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.match_id = p_match and a.kind = 'housing_license' and a.status = 'executed'
     and v.fields->>'rent_mode' = 'amount'
   order by a.executed_at desc limit 1
$$;

-- When a month's rent is due: the first month's on signing or the first day of the term, as the
-- license says; later months' on the license's due day (the last day of a shorter month).
create or replace function public.rent_due_on(p_match uuid, p_month date) returns date
  language plpgsql stable security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_last  integer := extract(day from (v_month + interval '1 month - 1 day'))::integer;
  b       record;
  l       record;
begin
  select * into b from public.match_rent_bounds(p_match);
  select * into l from public.match_license_rent(p_match);
  if v_month = date_trunc('month', b.first_day)::date then
    return case
      when l.first_rent = 'execution' and l.executed_on is not null then l.executed_on
      when l.first_rent = 'term_start' and l.term_start is not null then l.term_start
      else b.first_day
    end;
  end if;
  -- A due day after move-out (say the 31st, moving out on the 20th): due on the last night housed.
  return least(v_month + (least(greatest(coalesce(l.due_day, 1), 1), v_last) - 1),
               coalesce(b.housing_end, 'infinity'::date));
end $$;

-- Each month's rent for a match: through the month whose rent is due in the next 31 days, and no
-- later than move-out. Live from the agreed rent until the Host marks it received.
create or replace function public.match_rent_schedule(p_match uuid)
returns table (month date, due_on date, amount_cents integer, received_on date, late_from date,
               late_fee_cents integer, payment_method text)
  language plpgsql stable security definer set search_path = public as $$
declare
  b       record;
  l       record;
  v_today date := public.local_today();
  v_m     date;
  v_to    date;
  r       public.rent_payments;
begin
  if not exists (select 1 from public.matches m where m.id = p_match and auth.uid() in (m.host_id, m.joey_id)) then
    raise exception 'Match not found';
  end if;
  select * into b from public.match_rent_bounds(p_match);
  select * into l from public.match_license_rent(p_match);
  v_m := date_trunc('month', b.first_day)::date;
  v_to := date_trunc('month', coalesce(b.housing_end, 'infinity'::date))::date;
  while v_m <= v_to loop
    due_on := public.rent_due_on(p_match, v_m);
    select * into r from public.rent_payments rp where rp.match_id = p_match and rp.month = v_m;
    exit when due_on > v_today + 31 and r.match_id is null;
    month := v_m;
    amount_cents := coalesce(r.amount_cents, public.match_rent_for_month(p_match, v_m));
    received_on := r.received_on;
    late_from := case when l.late_days is not null then due_on + l.late_days + 1 end;
    late_fee_cents := case when l.late_days is not null then round(amount_cents * 0.05)::integer end;
    payment_method := l.payment_method;
    if amount_cents > 0 or r.match_id is not null then return next; end if;
    v_m := (v_m + interval '1 month')::date;
  end loop;
end $$;

-- The Host records a month's rent as received (freezing the amount), or undoes it (null date).
create or replace function public.mark_rent_received(p_match uuid, p_month date, p_received_on date) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_month  date := date_trunc('month', p_month)::date;
  v_amount integer;
begin
  if not exists (select 1 from public.matches m where m.id = p_match and m.host_id = auth.uid()) then
    raise exception 'Match not found';
  end if;
  if p_received_on is null then
    delete from public.rent_payments where match_id = p_match and month = v_month;
    return;
  end if;
  if p_received_on > public.local_today() then raise exception 'The date received can''t be in the future'; end if;
  v_amount := public.match_rent_for_month(p_match, v_month);
  if v_amount <= 0 then raise exception 'No rent is due for that month'; end if;
  insert into public.rent_payments (match_id, month, amount_cents, received_on, marked_by)
  values (p_match, v_month, v_amount, p_received_on, auth.uid())
  on conflict (match_id, month) do update set received_on = excluded.received_on, marked_by = excluded.marked_by, marked_at = now();
end $$;

-- JoeyCo stops handling rent: no more payroll (rent withholding) runs, and the Host's monthly
-- statement is fees only.
create or replace function public.generate_due_payment_runs(p_today date default null) returns setof uuid
  language plpgsql security definer set search_path = public as $$
declare
  s        public.billing_settings;
  v_today  date;
  v_d      date;
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
end $$;

create or replace function public.generate_host_monthly_run(p_month date) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  s        public.billing_settings;
  v_ms     date := date_trunc('month', p_month)::date;
  v_me     date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_run    uuid;
  v_line   uuid;
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

  -- Service fee: one per Host with any match active this month
  v_amt := public.fee_amount('service_monthly', v_ms);
  if v_amt > 0 then
    insert into public.payment_lines (run_id, party_id, kind, description, service_start, service_end, amount_cents)
    select distinct v_run, m.host_id, 'service_fee'::public.line_kind,
           format('JoeyCo service fee, %s', to_char(v_ms, 'FMMonth YYYY')), v_ms, v_me, -v_amt
      from public.matches_active_between(v_ms, v_me) m;
  end if;

  -- One-time fees incurred through month end and not yet billed
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
  return v_run;
end $$;

revoke all on function public.match_rent_bounds(uuid) from public, anon, authenticated;
revoke all on function public.match_rent_for_month(uuid, date) from public, anon, authenticated;
revoke all on function public.match_license_rent(uuid) from public, anon, authenticated;
revoke all on function public.rent_due_on(uuid, date) from public, anon, authenticated;
revoke all on function public.match_rent_schedule(uuid) from public, anon;
revoke all on function public.mark_rent_received(uuid, date, date) from public, anon;
grant execute on function public.match_rent_schedule(uuid) to authenticated;
grant execute on function public.mark_rent_received(uuid, date, date) to authenticated;
