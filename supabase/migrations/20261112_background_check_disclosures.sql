-- Background check disclosures in the Joey application.
-- A Joey reads each disclosure in a modal and signs it by typing their full name.
-- The signed-at time is stamped here, by the database, so it can't be set from the browser.
--
-- Run this BEFORE deploying the portal change: the application page selects these columns.

alter table public.joey_applications
  add column if not exists bg_disclosure_signature text,
  add column if not exists bg_disclosure_version text,
  add column if not exists bg_disclosure_signed_at timestamptz,
  add column if not exists ca_disclosure_signature text,
  add column if not exists ca_disclosure_version text,
  add column if not exists ca_disclosure_signed_at timestamptz,
  add column if not exists ca_report_copy_requested boolean;

comment on column public.joey_applications.bg_disclosure_signature is
  'Typed full name signing the federal background check disclosure and authorization';
comment on column public.joey_applications.bg_disclosure_version is
  'Version of the federal disclosure text that was signed (lib/joey/disclosures.ts)';
comment on column public.joey_applications.bg_disclosure_signed_at is
  'When the federal disclosure was signed. Set by trigger only.';
comment on column public.joey_applications.ca_disclosure_signature is
  'Typed full name signing the California investigative consumer report disclosure and authorization';
comment on column public.joey_applications.ca_disclosure_version is
  'Version of the California disclosure text that was signed (lib/joey/disclosures.ts)';
comment on column public.joey_applications.ca_disclosure_signed_at is
  'When the California disclosure was signed. Set by trigger only.';
comment on column public.joey_applications.ca_report_copy_requested is
  'Joey checked "I want a free copy of any investigative consumer report obtained about me"';

-- Stamp signed_at whenever a signature is given or changed; clear it when the signature is
-- cleared. Any direct write to signed_at is ignored.
create or replace function public.stamp_disclosure_signatures()
returns trigger
language plpgsql
as $$
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

drop trigger if exists stamp_disclosure_signatures on public.joey_applications;
create trigger stamp_disclosure_signatures
  before update on public.joey_applications
  for each row execute function public.stamp_disclosure_signatures();

-- If Joeys' update rights are granted per column, allow the new answer columns too.
-- (Harmless if the table-level grant already covers them.)
grant update (
  bg_disclosure_signature, bg_disclosure_version,
  ca_disclosure_signature, ca_disclosure_version, ca_report_copy_requested
) on public.joey_applications to authenticated;

-- TODO: also add these two checks to public.application_missing(), after the references check,
-- so submit_my_application() enforces them too (the portal's submit action already does):
--
--   if nullif(trim(a.bg_disclosure_signature), '') is null then missing := missing || 'bg_disclosure_signature'; end if;
--   if nullif(trim(a.ca_disclosure_signature), '') is null then missing := missing || 'ca_disclosure_signature'; end if;
--
-- (Adjust the variable names to match the function's body.)
