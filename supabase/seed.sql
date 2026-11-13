-- Local test data. Runs after migrations on `supabase start` / `supabase db reset` (local only;
-- never pushed). Every account's password is: joeyco-local-test
--
--   host@joeyco.test          Host, matched with Jamie
--   jamie@joeyco.test         Joey, matched (full portal; Agreements with the Host)
--   riley@joeyco.test         Joey at Match Ready, not matched (Agreements replaces the application)
--   sam@joeyco.test           Joey with a blank draft application

create or replace function pg_temp.test_user(p_id uuid, p_email text, p_name text, p_role public.user_role)
returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('joeyco-local-test', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  -- public.handle_new_user() has created the profile; set the role chosen at onboarding.
  update public.profiles set role = p_role where id = p_id;
end $$;

select pg_temp.test_user('00000000-0000-4000-a000-000000000001', 'host@joeyco.test', 'Pat Host', 'host');
select pg_temp.test_user('00000000-0000-4000-a000-000000000002', 'jamie@joeyco.test', 'Jamie Joey', 'joey');
select pg_temp.test_user('00000000-0000-4000-a000-000000000003', 'riley@joeyco.test', 'Riley Ready', 'joey');
select pg_temp.test_user('00000000-0000-4000-a000-000000000004', 'sam@joeyco.test', 'Sam Starter', 'joey');

-- Submitted applications for Jamie (matched) and Riley (Match Ready), with every acknowledgement signed.
insert into public.joey_applications (
  joey_id, first_name, last_name, phone, date_of_birth, work_authorized, school_degree, host_preference,
  preferred_cities, move_in_timing, services, why_joey, heard_about, news_opt_in,
  conduct_signature, conduct_version, conduct_signed_at,
  bg_disclosure_signature, bg_disclosure_version, bg_disclosure_signed_at,
  ca_disclosure_signature, ca_disclosure_version, ca_disclosure_signed_at, ca_report_copy_requested,
  status, submitted_at, stage_key, stage_changed_at
)
select id, first, last, '(415) 555-0100', '2002-04-12', 'Yes', 'UC Berkeley, BA Public Health (2026)', 'Both',
  array['Berkeley', 'Oakland'], 'As soon as possible', array['Light Housekeeping', 'Groceries, Meal Prep & Dishes', 'Errands & Returns'],
  'I grew up helping my grandparents and want to keep doing that while I study.', 'My school', false,
  first || ' ' || last, 'conduct-2026-11', now() - interval '20 days',
  first || ' ' || last, 'federal-2026-11', now() - interval '20 days',
  first || ' ' || last, 'ca-icra-2026-11', now() - interval '20 days', true,
  'submitted', now() - interval '20 days', stage, now() - interval '2 days'
from (values
  ('00000000-0000-4000-a000-000000000002'::uuid, 'Jamie', 'Joey', 'matched'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'Riley', 'Ready', 'approved')
) as t(id, first, last, stage);

insert into public.application_stage_events (joey_id, stage_key, occurred_at, source)
select j, s, now() - (d || ' days')::interval, 'clarify'
from (values
  ('00000000-0000-4000-a000-000000000002'::uuid, 'in_review', 20), ('00000000-0000-4000-a000-000000000002'::uuid, 'approved', 8),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'matched', 2),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'in_review', 20), ('00000000-0000-4000-a000-000000000003'::uuid, 'approved', 2)
) as e(j, s, d);

insert into public.joey_references (joey_id, full_name, reference_type, relationship, email, phone, known_for)
select j, n, t, r, e, '(415) 555-0199', '2 years'
from (values
  ('00000000-0000-4000-a000-000000000002'::uuid, 'Alex Manager', 'Professional', 'Manager at the campus café', 'alex@example.com'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'Dana Advisor', 'Institutional', 'Academic advisor', 'dana@example.com'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'Chris Landlord', 'Landlord', 'Rented a room from them', 'chris@example.com'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'Morgan Roommate', 'Housemate', 'Lived together for a year', 'morgan@example.com')
) as x(j, n, t, r, e);

-- Sam starts with an empty draft (the app creates it on first visit, too).
insert into public.joey_applications (joey_id) values ('00000000-0000-4000-a000-000000000004');

-- Pat and Jamie are matched, with agreed terms so payroll and prefills have numbers.
insert into public.matches (id, host_id, joey_id, started_at)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', now() - interval '2 days');

insert into public.match_terms (match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, note, proposed_by, proposed_at, responded_by, responded_at)
values ('00000000-0000-4000-b000-000000000001', current_date - 2, 2500, 90000, 'accepted', 'Seed terms',
        '00000000-0000-4000-a000-000000000001', now() - interval '2 days', '00000000-0000-4000-a000-000000000002', now() - interval '2 days');
