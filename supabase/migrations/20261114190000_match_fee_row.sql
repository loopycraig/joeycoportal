-- The match fee is charged when a housing license is signed, from the match's match-fee row. Some
-- matches (made before fees were recorded) have no such row, so signing their license charged
-- nothing. Create the row when it's missing.

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

  -- A match with no match-fee row (one made before fees were recorded) gets one now. Already
  -- charged or waived: nothing to do.
  if not exists (select 1 from public.host_fees where match_id = a.match_id and code = 'match') then
    insert into public.host_fees (host_id, match_id, code, amount_cents, incurred_on)
    select m.host_id, m.id, 'match', 0, (m.started_at at time zone public.billing_tz())::date
      from public.matches m where m.id = a.match_id
    on conflict do nothing;
  end if;
  select * into fee from public.host_fees
   where match_id = a.match_id and code = 'match' and not waived and payment_line_id is null
   for update;
  if not found then return null; end if;

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

revoke all on function public.charge_match_fee_for_license(uuid) from public, anon, authenticated;
