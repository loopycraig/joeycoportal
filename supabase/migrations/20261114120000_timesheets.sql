-- Timesheets: Joeys enter time by workweek (Mon–Sun); Hosts approve by pay period.
--
-- * pay_schedules   per-match pay frequency with effective dates (default: semi-monthly, as in
--                   the offer letter). pay_period_for() is the only place pay periods are worked out.
-- * pay_periods     a match's pay period once something is submitted into it. Its dates are frozen,
--                   so a later schedule change never moves history. handed_off_at = "entered in
--                   Poppins" (or whichever payroll provider the Host uses).
-- * time_entries    one row per shift or time-off day. Status lives on the day, so a Joey can submit
--                   the first half of a week at a pay-period cutoff and the rest later.
-- * pto_ledger      grants (yearly, from the offer letter), time off used, adjustments, payouts.
--                   The balance is the sum.
--
-- Wages are now paid through each Host's payroll provider, so JoeyCo's payroll run no longer pays
-- wages; it keeps rent withholding only. Replaces public.timecards.

create type public.pay_schedule_kind as enum ('semimonthly', 'weekly', 'biweekly', 'monthly');
create type public.time_entry_kind as enum ('work', 'pto', 'sick', 'holiday');
create type public.time_entry_status as enum ('draft', 'submitted', 'approved', 'changes_requested');
create type public.pto_entry_kind as enum ('grant', 'used', 'adjustment', 'payout');

create or replace function public.local_today() returns date
  language sql stable security definer set search_path = public as $$
  select (now() at time zone public.billing_tz())::date
$$;

-- ---------------------------------------------------------------------------
-- Pay schedules and periods
-- ---------------------------------------------------------------------------

create table public.pay_schedules (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches(id) on delete cascade,
  effective_from      date not null,
  kind                public.pay_schedule_kind not null,
  -- weekly / biweekly: the first day of any one period (always a Monday, so weeks never split)
  anchor_date         date,
  -- weekly / biweekly / monthly: payday is this many days after the period ends.
  -- Semi-monthly paydays follow the offer letter: 1st–15th by the 26th, 16th–end by the 10th.
  payday_offset_days  integer not null default 5 check (payday_offset_days between 0 and 30),
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  unique (match_id, effective_from),
  check (kind not in ('weekly', 'biweekly') or anchor_date is not null)
);

-- The natural period of a schedule containing p_date, ignoring when the schedule starts or ends.
create or replace function public.pay_period_natural(
  p_kind public.pay_schedule_kind, p_anchor date, p_offset integer, p_date date
) returns table (period_start date, period_end date, payday date)
  language plpgsql immutable as $$
declare
  v_month date := date_trunc('month', p_date)::date;
  v_len   integer;
begin
  if p_kind = 'semimonthly' then
    if extract(day from p_date) <= 15 then
      return query select v_month, v_month + 14, v_month + 25;
    else
      return query select v_month + 15, (v_month + interval '1 month - 1 day')::date,
                          (v_month + interval '1 month')::date + 9;
    end if;
  elsif p_kind = 'monthly' then
    return query select v_month, (v_month + interval '1 month - 1 day')::date,
                        (v_month + interval '1 month - 1 day')::date + p_offset;
  else
    v_len := case p_kind when 'weekly' then 7 else 14 end;
    period_start := p_anchor + (floor((p_date - p_anchor)::numeric / v_len) * v_len)::integer;
    period_end := period_start + v_len - 1;
    payday := period_end + p_offset;
    return next;
  end if;
end $$;

-- The pay period containing p_date for a match, under the schedule in force that day. A schedule's
-- first period starts on its effective date and its last ends the day before the next one starts,
-- so a change of schedule makes at most one short transition period.
create or replace function public.pay_period_for(p_match uuid, p_date date)
returns table (period_start date, period_end date, payday date)
  language plpgsql stable security definer set search_path = public as $$
declare
  s      public.pay_schedules;
  v_next date;
begin
  select * into s from public.pay_schedules
   where match_id = p_match and effective_from <= p_date
   order by effective_from desc limit 1;
  select min(effective_from) into v_next from public.pay_schedules
   where match_id = p_match and effective_from > p_date;

  if s.id is null then
    select n.period_start, n.period_end, n.payday into period_start, period_end, payday
      from public.pay_period_natural('semimonthly', null, 0, p_date) n;
  else
    select n.period_start, n.period_end, n.payday into period_start, period_end, payday
      from public.pay_period_natural(s.kind, s.anchor_date, s.payday_offset_days, p_date) n;
    period_start := greatest(period_start, s.effective_from);
  end if;
  if v_next is not null and period_end >= v_next then
    period_end := v_next - 1;
  end if;
  return next;
end $$;

create table public.pay_periods (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  payday          date not null,
  handed_off_at   timestamptz,
  handed_off_by   uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  unique (match_id, period_start),
  check (period_end >= period_start)
);

-- The pay_periods row for the period containing p_date, created if needed.
create or replace function public.ensure_pay_period(p_match uuid, p_date date) returns public.pay_periods
  language plpgsql security definer set search_path = public as $$
declare
  p public.pay_periods;
  n record;
begin
  select * into p from public.pay_periods
   where match_id = p_match and period_start <= p_date and period_end >= p_date;
  if found then return p; end if;
  select * into n from public.pay_period_for(p_match, p_date);
  insert into public.pay_periods (match_id, period_start, period_end, payday)
  values (p_match, n.period_start, n.period_end, n.payday)
  on conflict (match_id, period_start) do nothing;
  select * into p from public.pay_periods where match_id = p_match and period_start = n.period_start;
  return p;
end $$;

-- Every pay period touching a date range, for showing cutoffs on a week.
create or replace function public.pay_periods_between(p_match uuid, p_from date, p_to date)
returns table (period_start date, period_end date, payday date, handed_off boolean)
  language sql stable security definer set search_path = public as $$
  select distinct coalesce(pp.period_start, n.period_start), coalesce(pp.period_end, n.period_end),
         coalesce(pp.payday, n.payday), pp.handed_off_at is not null
    from generate_series(p_from, p_to, interval '1 day') d
   cross join lateral public.pay_period_for(p_match, d::date) n
    left join public.pay_periods pp
      on pp.match_id = p_match and pp.period_start <= d::date and pp.period_end >= d::date
   where exists (select 1 from public.matches m
                  where m.id = p_match and auth.uid() in (m.host_id, m.joey_id))
   order by 1
$$;

-- The Host changes a match's pay schedule. It takes effect the day after the current pay period
-- ends; anything already scheduled after that is replaced.
create or replace function public.set_pay_schedule(
  p_match uuid, p_kind public.pay_schedule_kind, p_payday_offset integer default null
) returns date
  language plpgsql security definer set search_path = public as $$
declare
  v_from   date;
  v_anchor date;
  v_ids    uuid[];
begin
  if not exists (select 1 from public.matches
                  where id = p_match and host_id = auth.uid() and ended_at is null) then
    raise exception 'Match not found';
  end if;
  select period_end + 1 into v_from from public.pay_period_for(p_match, public.local_today());
  -- Weekly and biweekly periods run Monday to Sunday, the same as the workweek.
  if p_kind in ('weekly', 'biweekly') then
    v_anchor := v_from + ((8 - extract(isodow from v_from)::integer) % 7);
  end if;

  -- Periods after the change only hold time off requested ahead (they can't be in payroll yet):
  -- take their days out, rebuild the periods under the new schedule, and put the days back.
  select array_agg(t.id) into v_ids
    from public.time_entries t join public.pay_periods p on p.id = t.pay_period_id
   where p.match_id = p_match and p.period_start >= v_from;
  update public.time_entries set pay_period_id = null where id = any(v_ids);
  delete from public.pay_periods where match_id = p_match and period_start >= v_from;

  delete from public.pay_schedules where match_id = p_match and effective_from >= v_from;
  insert into public.pay_schedules (match_id, effective_from, kind, anchor_date, payday_offset_days, created_by)
  values (p_match, v_from, p_kind, v_anchor, coalesce(p_payday_offset, 5), auth.uid());

  update public.time_entries t
     set pay_period_id = (public.ensure_pay_period(t.match_id, t.work_date)).id
   where t.id = any(v_ids);
  return v_from;
end $$;

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------

create table public.time_entries (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches(id) on delete restrict,
  joey_id             uuid not null references public.profiles(id) on delete cascade,
  host_id             uuid not null references public.profiles(id) on delete cascade,
  work_date           date not null,
  kind                public.time_entry_kind not null default 'work',
  start_time          time,
  end_time            time,
  meal_break_minutes  integer not null default 0 check (meal_break_minutes between 0 and 240),
  hours               numeric(4,2) not null check (hours > 0 and hours <= 24),
  tags                text[] not null default '{}',
  notes               text,
  status              public.time_entry_status not null default 'draft',
  pay_period_id       uuid references public.pay_periods(id) on delete restrict,
  -- Submitted after its own pay period was entered in payroll, so it's paid in a later period.
  late                boolean not null default false,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid references public.profiles(id),
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or kind = 'work')
);

create index time_entries_joey_date_idx on public.time_entries (joey_id, work_date);
create index time_entries_host_status_idx on public.time_entries (host_id, status);
create index time_entries_match_date_idx on public.time_entries (match_id, work_date);
create index time_entries_period_idx on public.time_entries (pay_period_id);

-- Hours come from the times when there are times (an end before the start runs past midnight).
create or replace function public.time_entries_before_write() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  if new.start_time is not null then
    new.hours := round((extract(epoch from (new.end_time - new.start_time)) / 3600.0
                 + case when new.end_time <= new.start_time then 24 else 0 end
                 - new.meal_break_minutes / 60.0)::numeric, 2);
  end if;
  new.notes := nullif(trim(new.notes), '');
  return new;
end $$;

create trigger time_entries_before_write before insert or update on public.time_entries
  for each row execute function public.time_entries_before_write();

alter table public.time_entries enable row level security;

create policy "joey reads own entries" on public.time_entries for select
  using (joey_id = auth.uid());
create policy "host reads submitted entries" on public.time_entries for select
  using (host_id = auth.uid() and status <> 'draft');
create policy "joey adds drafts on open match" on public.time_entries for insert
  with check (
    joey_id = auth.uid() and status = 'draft' and pay_period_id is null
    and exists (select 1 from public.matches m
                 where m.id = match_id and m.joey_id = auth.uid() and m.host_id = time_entries.host_id
                   and m.ended_at is null));
create policy "joey edits drafts" on public.time_entries for update
  using (joey_id = auth.uid() and status in ('draft', 'changes_requested'))
  with check (joey_id = auth.uid() and status in ('draft', 'changes_requested'));
create policy "joey deletes drafts" on public.time_entries for delete
  using (joey_id = auth.uid() and status in ('draft', 'changes_requested'));

-- Status, period and review columns change only through the functions below.
revoke insert, update, truncate on public.time_entries from anon, authenticated;
grant insert (match_id, joey_id, host_id, work_date, kind, start_time, end_time, meal_break_minutes, hours, tags, notes)
  on public.time_entries to authenticated;
grant update (work_date, kind, start_time, end_time, meal_break_minutes, hours, tags, notes)
  on public.time_entries to authenticated;

-- The Joey submits days. Days that haven't happened yet can only be time off requests.
create or replace function public.submit_time_entries(p_ids uuid[]) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  e       public.time_entries;
  p       public.pay_periods;
  v_today date := public.local_today();
  v_late  boolean;
  v_count integer := 0;
begin
  for e in select * from public.time_entries
            where id = any(p_ids) and joey_id = auth.uid() and status in ('draft', 'changes_requested')
            order by work_date
            for update
  loop
    if e.work_date > v_today and e.kind not in ('pto', 'holiday') then
      raise exception 'Hours for % can be submitted once the day is over', to_char(e.work_date, 'Mon FMDD');
    end if;
    if not exists (select 1 from public.matches where id = e.match_id and ended_at is null) then
      raise exception 'This match has already ended';
    end if;
    p := public.ensure_pay_period(e.match_id, e.work_date);
    v_late := false;
    -- Its period is already in payroll: pay it in the first period that isn't.
    while p.handed_off_at is not null loop
      v_late := true;
      p := public.ensure_pay_period(e.match_id, greatest(p.period_end + 1, v_today));
    end loop;
    update public.time_entries
       set status = 'submitted', pay_period_id = p.id, late = v_late, submitted_at = now()
     where id = e.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Nothing to submit'; end if;
  return v_count;
end $$;

-- The Joey takes back submitted days the Host hasn't reviewed yet.
create or replace function public.withdraw_time_entries(p_ids uuid[]) returns integer
  language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.time_entries
     set status = 'draft', pay_period_id = null, late = false, submitted_at = null
   where id = any(p_ids) and joey_id = auth.uid() and status = 'submitted';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Not awaiting review'; end if;
  return v_count;
end $$;

-- The Host approves every submitted day in a pay period.
create or replace function public.approve_pay_period(p_period uuid) returns integer
  language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not exists (select 1 from public.pay_periods pp join public.matches m on m.id = pp.match_id
                  where pp.id = p_period and m.host_id = auth.uid()) then
    raise exception 'Pay period not found';
  end if;
  update public.time_entries
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), review_note = null
   where pay_period_id = p_period and host_id = auth.uid() and status = 'submitted';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Not awaiting review'; end if;
  return v_count;
end $$;

-- The Host sends days back to the Joey with a note.
create or replace function public.request_time_changes(p_ids uuid[], p_note text) returns integer
  language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if nullif(trim(p_note), '') is null then raise exception 'Say what needs changing'; end if;
  update public.time_entries
     set status = 'changes_requested', reviewed_at = now(), reviewed_by = auth.uid(),
         review_note = trim(p_note)
   where id = any(p_ids) and host_id = auth.uid() and status = 'submitted';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Not awaiting review'; end if;
  return v_count;
end $$;

-- The Host marks a pay period as entered in payroll (or undoes it). Days submitted into a period
-- after this are paid in the next open one.
create or replace function public.set_pay_period_handed_off(p_period uuid, p_done boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.pay_periods pp join public.matches m on m.id = pp.match_id
                  where pp.id = p_period and m.host_id = auth.uid()) then
    raise exception 'Pay period not found';
  end if;
  if p_done and exists (select 1 from public.pay_periods
                         where id = p_period and period_end >= public.local_today()) then
    raise exception 'A pay period can be entered in payroll once it''s over';
  end if;
  if p_done and exists (select 1 from public.time_entries
                         where pay_period_id = p_period and status = 'submitted') then
    raise exception 'Approve or send back every day in this pay period first';
  end if;
  update public.pay_periods
     set handed_off_at = case when p_done then now() end,
         handed_off_by = case when p_done then auth.uid() end
   where id = p_period;
end $$;

-- ---------------------------------------------------------------------------
-- PTO ledger
-- ---------------------------------------------------------------------------

create table public.pto_ledger (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.matches(id) on delete cascade,
  effective_on   date not null,
  kind           public.pto_entry_kind not null,
  hours          numeric(6,2) not null,
  time_entry_id  uuid unique references public.time_entries(id) on delete restrict,
  note           text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create unique index pto_ledger_one_grant_per_day on public.pto_ledger (match_id, effective_on) where kind = 'grant';
create index pto_ledger_match_idx on public.pto_ledger (match_id, effective_on);

alter table public.pto_ledger enable row level security;
create policy "parties read pto" on public.pto_ledger for select
  using (exists (select 1 from public.matches m
                  where m.id = match_id and auth.uid() in (m.host_id, m.joey_id)));
revoke insert, update, delete, truncate on public.pto_ledger from anon, authenticated;

-- Approved PTO and sick days come out of the balance.
create or replace function public.time_entries_after_approve() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.kind in ('pto', 'sick') then
    insert into public.pto_ledger (match_id, effective_on, kind, hours, time_entry_id, note, created_by)
    values (new.match_id, new.work_date, 'used', -new.hours, new.id,
            case new.kind when 'sick' then 'Sick time' else 'Paid time off' end, new.reviewed_by)
    on conflict (time_entry_id) do nothing;
  end if;
  return null;
end $$;

create trigger time_entries_after_approve after update on public.time_entries
  for each row execute function public.time_entries_after_approve();

-- Grants the offer letter's PTO on the start date and each work anniversary since. Unused time
-- carries over. Days become hours at the Joey's average scheduled day (Exhibit A), falling back to
-- weekly minimum hours ÷ 5, then 8. Safe to call any number of times.
create or replace function public.pto_sync_grants(p_match uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  m        public.matches;
  v_offer  jsonb;
  v_amount numeric;
  v_unit   text;
  v_start  date;
  v_day    numeric;
  v_hours  numeric;
  v_end    date;
  v_on     date;
  k        integer := 0;
begin
  select * into m from public.matches where id = p_match;
  if not found then return; end if;
  if auth.uid() is not null and auth.uid() not in (m.host_id, m.joey_id) then
    raise exception 'Match not found';
  end if;

  select v.fields into v_offer from public.agreements a
    join public.agreement_versions v on v.agreement_id = a.id and v.version = a.current_version
   where a.match_id = p_match and a.kind = 'offer_letter' and a.status = 'executed'
   order by a.executed_at desc limit 1;
  if v_offer is null then return; end if;

  v_amount := nullif(v_offer->>'pto_amount', '')::numeric;
  v_unit := coalesce(v_offer->>'pto_unit', 'days');
  v_start := nullif(v_offer->>'start_date', '')::date;
  if v_amount is null or v_amount <= 0 or v_start is null then return; end if;

  select avg(nullif(regexp_replace(r->>'hours', '[^0-9.]', '', 'g'), '')::numeric)
    into v_day
    from jsonb_array_elements(coalesce(v_offer->'schedule', '[]')) with ordinality as x(r, i)
   where i <= 7 and nullif(regexp_replace(r->>'hours', '[^0-9.]', '', 'g'), '')::numeric > 0;
  v_day := coalesce(v_day, nullif(v_offer->>'weekly_min_hours', '')::numeric / 5, 8);
  v_hours := round(case when v_unit = 'hours' then v_amount else v_amount * v_day end, 2);

  -- No new grants after the last day of work.
  v_end := least(public.local_today(), coalesce((m.ended_at at time zone public.billing_tz())::date - 1, 'infinity'),
                 coalesce(m.employment_ends_on, 'infinity'));
  loop
    v_on := (v_start + make_interval(years => k))::date;
    exit when v_on > v_end;
    insert into public.pto_ledger (match_id, effective_on, kind, hours, note)
    values (p_match, v_on, 'grant', v_hours,
            case when v_unit = 'hours' then format('%s hours from the offer letter', v_amount)
                 else format('%s days from the offer letter at %s hours a day', v_amount, round(v_day, 2)) end)
    on conflict (match_id, effective_on) where kind = 'grant' do nothing;
    k := k + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Move existing timecards over, then retire them
-- ---------------------------------------------------------------------------

do $$
declare
  t record;
  p public.pay_periods;
begin
  for t in select * from public.timecards order by work_date loop
    p := null;
    if t.status <> 'draft' then
      p := public.ensure_pay_period(t.match_id, t.work_date);
    end if;
    insert into public.time_entries
      (match_id, joey_id, host_id, work_date, kind, hours, notes, status, pay_period_id,
       submitted_at, reviewed_at, review_note, created_at)
    values
      (t.match_id, t.joey_id, t.host_id, t.work_date, 'work', t.hours, t.notes,
       case t.status when 'rejected' then 'changes_requested'::public.time_entry_status
                     else t.status::text::public.time_entry_status end,
       p.id, t.submitted_at, t.reviewed_at, t.review_note, t.created_at);
  end loop;
end $$;

-- What's locked for rate changes: days already entered in payroll, and rent already withheld.
create or replace function public.match_locked_through(p_match_id uuid) returns date
  language sql stable security definer set search_path = public as $$
  select max(d) from (
    select max(t.work_date) as d
      from public.time_entries t
      join public.pay_periods p on p.id = t.pay_period_id
     where t.match_id = p_match_id and p.handed_off_at is not null
    union all
    select max(l.service_end)
      from public.payment_lines l
     where l.match_id = p_match_id and l.kind = 'rent_withholding'
  ) x
$$;

-- Payroll run: wages are paid through the Host's payroll provider now, so this only withholds rent.
create or replace function public.generate_payroll_run(p_period_start date) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  s       public.billing_settings;
  v_end   date := p_period_start + 13;
  v_from  date;
  v_run   uuid;
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

  -- Rent withholding: the Joey's rent for the days in this period.
  -- JoeyCo already paid the Host this rent in advance; this recovers it.
  -- Only days from host_billing_start on, since earlier rent wasn't fronted by JoeyCo.
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

drop function public.review_timecard(uuid, public.timecard_status, text);
drop table public.timecards;
drop function public.timecards_touch();
drop type public.timecard_status;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.pay_schedules enable row level security;
create policy "parties read pay schedules" on public.pay_schedules for select
  using (exists (select 1 from public.matches m
                  where m.id = match_id and auth.uid() in (m.host_id, m.joey_id)));
revoke insert, update, delete, truncate on public.pay_schedules from anon, authenticated;

alter table public.pay_periods enable row level security;
create policy "parties read pay periods" on public.pay_periods for select
  using (exists (select 1 from public.matches m
                  where m.id = match_id and auth.uid() in (m.host_id, m.joey_id)));
revoke insert, update, delete, truncate on public.pay_periods from anon, authenticated;

revoke all on function public.local_today() from public, anon;
revoke all on function public.pay_period_for(uuid, date) from public, anon;
revoke all on function public.ensure_pay_period(uuid, date) from public, anon, authenticated;
revoke all on function public.pay_periods_between(uuid, date, date) from public, anon;
revoke all on function public.set_pay_schedule(uuid, public.pay_schedule_kind, integer) from public, anon;
revoke all on function public.submit_time_entries(uuid[]) from public, anon;
revoke all on function public.withdraw_time_entries(uuid[]) from public, anon;
revoke all on function public.approve_pay_period(uuid) from public, anon;
revoke all on function public.request_time_changes(uuid[], text) from public, anon;
revoke all on function public.set_pay_period_handed_off(uuid, boolean) from public, anon;
revoke all on function public.pto_sync_grants(uuid) from public, anon;
revoke all on function public.time_entries_after_approve() from public, anon, authenticated;

grant execute on function public.local_today() to authenticated;
grant execute on function public.pay_period_for(uuid, date) to authenticated;
grant execute on function public.pay_periods_between(uuid, date, date) to authenticated;
grant execute on function public.set_pay_schedule(uuid, public.pay_schedule_kind, integer) to authenticated;
grant execute on function public.submit_time_entries(uuid[]) to authenticated;
grant execute on function public.withdraw_time_entries(uuid[]) to authenticated;
grant execute on function public.approve_pay_period(uuid) to authenticated;
grant execute on function public.request_time_changes(uuid[], text) to authenticated;
grant execute on function public.set_pay_period_handed_off(uuid, boolean) to authenticated;
grant execute on function public.pto_sync_grants(uuid) to authenticated;
