-- Each pay period records whether the Joey was paid, independent of any payroll provider. The Host
-- marks it paid (date, gross amount, optional reference); the Joey sees it on Payments with the due
-- date (the period's payday).
--
-- Marking paid also closes the period (handed_off_at), as "entered in Poppins" did: days submitted
-- into it afterwards are paid in the next open period, and rates can't change for it.

alter table public.pay_periods
  add column paid_on date,
  add column paid_amount_cents integer check (paid_amount_cents is null or paid_amount_cents >= 0),
  add column paid_note text,
  add column paid_marked_by uuid references public.profiles(id),
  add column paid_marked_at timestamptz,
  add constraint pay_periods_paid_together check ((paid_on is null) = (paid_amount_cents is null));

create or replace function public.mark_pay_period_paid(
  p_period uuid, p_paid_on date, p_amount_cents integer, p_note text default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare p public.pay_periods;
begin
  select pp.* into p from public.pay_periods pp join public.matches m on m.id = pp.match_id
   where pp.id = p_period and m.host_id = auth.uid()
   for update of pp;
  if not found then raise exception 'Pay period not found'; end if;
  if p_paid_on is null or p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'Enter the date paid and the amount';
  end if;
  if p_paid_on > public.local_today() then raise exception 'The date paid can''t be in the future'; end if;
  if exists (select 1 from public.time_entries where pay_period_id = p_period and status in ('submitted', 'changes_requested')) then
    raise exception 'Approve or resolve every day in this pay period first';
  end if;
  update public.pay_periods
     set paid_on = p_paid_on, paid_amount_cents = p_amount_cents, paid_note = nullif(trim(p_note), ''),
         paid_marked_by = auth.uid(), paid_marked_at = now(),
         handed_off_at = coalesce(handed_off_at, now()), handed_off_by = coalesce(handed_off_by, auth.uid())
   where id = p_period;
end $$;

-- Undo a mistaken "paid".
create or replace function public.unmark_pay_period_paid(p_period uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.pay_periods pp
     set paid_on = null, paid_amount_cents = null, paid_note = null, paid_marked_by = null, paid_marked_at = null,
         handed_off_at = null, handed_off_by = null
    from public.matches m
   where pp.id = p_period and m.id = pp.match_id and m.host_id = auth.uid() and pp.paid_on is not null;
  if not found then raise exception 'Pay period not found or not marked paid'; end if;
end $$;

revoke all on function public.mark_pay_period_paid(uuid, date, integer, text) from public, anon;
revoke all on function public.unmark_pay_period_paid(uuid) from public, anon;
grant execute on function public.mark_pay_period_paid(uuid, date, integer, text) to authenticated;
grant execute on function public.unmark_pay_period_paid(uuid) to authenticated;
-- "Entered in Poppins" is replaced by marking paid.
revoke execute on function public.set_pay_period_handed_off(uuid, boolean) from authenticated;
