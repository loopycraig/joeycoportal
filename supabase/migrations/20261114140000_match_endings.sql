-- Ending a match follows the contracts. Employment is at will (Offer Letter §4), so the Host sets
-- the last day of work. Housing then ends on at least 7 days' written notice (Offer Letter §4,
-- Housing License §II), so the move-out date is at least 7 days after both the notice and the last
-- day of work. The written
-- notice itself is an agreement of kind termination_notice that the Joey acknowledges (created by
-- lib/agreements/actions.ts endMatchWithNotice).
--
-- The match stays open until the move-out date, because the Joey still lives there and rent still
-- runs. No hours can be logged after the last day of work. The daily cron calls
-- finalize_match_ends() to pay out unused PTO after the last day and close the match on move-out.

alter table public.matches
  add column employment_ends_on date,
  add column housing_ends_on date,
  add column end_noticed_at timestamptz,
  add constraint matches_end_dates check (
    (employment_ends_on is null) = (housing_ends_on is null)
    and (housing_ends_on is null or housing_ends_on > employment_ends_on));

-- The Host ends employment and gives notice to vacate.
create or replace function public.schedule_match_end(p_match uuid, p_last_day date, p_move_out date) returns void
  language plpgsql security definer set search_path = public as $$
declare v_today date := public.local_today();
begin
  if not exists (select 1 from public.matches where id = p_match and host_id = auth.uid() and ended_at is null) then
    raise exception 'Match not found or already ended';
  end if;
  if p_last_day < v_today - 7 then
    raise exception 'The last day of work can''t be more than a week ago';
  end if;
  -- Offer Letter §4: housing ends on 7 days' written notice *after* employment ends, so count from
  -- the later of today (when notice is given) and the last day of work.
  if p_move_out < greatest(v_today, p_last_day) + 7 then
    raise exception 'The move-out date has to be at least 7 days after the last day of work and after today (the notice the contracts require). The earliest is %.',
      to_char(greatest(v_today, p_last_day) + 7, 'Mon FMDD');
  end if;
  if exists (select 1 from public.time_entries
              where match_id = p_match and kind = 'work' and work_date > p_last_day and status in ('submitted', 'approved')) then
    raise exception 'Hours are already submitted for days after %. Choose a later last day, or have them withdrawn first.',
      to_char(p_last_day, 'Mon FMDD');
  end if;
  update public.matches
     set employment_ends_on = p_last_day, housing_ends_on = p_move_out, end_noticed_at = now()
   where id = p_match;
end $$;

-- The Host takes it back before the last day of work.
create or replace function public.cancel_match_end(p_match uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.matches
     set employment_ends_on = null, housing_ends_on = null, end_noticed_at = null
   where id = p_match and host_id = auth.uid() and ended_at is null
     and employment_ends_on >= public.local_today();
  if not found then
    raise exception 'This can only be undone before the last day of work';
  end if;
end $$;

-- Daily: unused PTO is paid out once employment ends (it's owed with final pay; this records it),
-- and matches close on their move-out date.
create or replace function public.finalize_match_ends() returns integer
  language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.local_today();
  m       public.matches;
  v_bal   numeric;
  v_count integer := 0;
begin
  for m in select * from public.matches
            where ended_at is null and employment_ends_on is not null and employment_ends_on < v_today
  loop
    if not exists (select 1 from public.pto_ledger where match_id = m.id and kind = 'payout') then
      select coalesce(sum(hours), 0) into v_bal from public.pto_ledger where match_id = m.id;
      if v_bal > 0 then
        insert into public.pto_ledger (match_id, effective_on, kind, hours, note)
        values (m.id, m.employment_ends_on, 'payout', -v_bal, 'Unused PTO paid with final pay');
      end if;
    end if;
    if m.housing_ends_on <= v_today then
      update public.matches
         set ended_at = (m.housing_ends_on::timestamp at time zone public.billing_tz())
       where id = m.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- No hours after the last day of work.
drop policy "joey adds drafts on open match" on public.time_entries;
create policy "joey adds drafts on open match" on public.time_entries for insert
  with check (
    joey_id = auth.uid() and status = 'draft' and pay_period_id is null
    and exists (select 1 from public.matches m
                 where m.id = match_id and m.joey_id = auth.uid() and m.host_id = time_entries.host_id
                   and m.ended_at is null
                   and (m.employment_ends_on is null or time_entries.kind <> 'work'
                        or time_entries.work_date <= m.employment_ends_on)));

drop policy "joey edits drafts" on public.time_entries;
create policy "joey edits drafts" on public.time_entries for update
  using (joey_id = auth.uid() and status in ('draft', 'changes_requested'))
  with check (
    joey_id = auth.uid() and status in ('draft', 'changes_requested')
    and exists (select 1 from public.matches m
                 where m.id = match_id
                   and (m.employment_ends_on is null or time_entries.kind <> 'work'
                        or time_entries.work_date <= m.employment_ends_on)));

revoke all on function public.schedule_match_end(uuid, date, date) from public, anon;
revoke all on function public.cancel_match_end(uuid) from public, anon;
revoke all on function public.finalize_match_ends() from public, anon, authenticated;
grant execute on function public.schedule_match_end(uuid, date, date) to authenticated;
grant execute on function public.cancel_match_end(uuid) to authenticated;
