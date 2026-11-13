-- The Code of Conduct is now read and signed in a modal like the background check disclosures,
-- so its signature records which version of the text was signed (lib/joey/disclosures.ts).
-- conduct_signed_at is still stamped by joey_applications_before_update().

alter table public.joey_applications add column if not exists conduct_version text;

comment on column public.joey_applications.conduct_version is
  'Version of the Code of Conduct text that was signed (lib/joey/disclosures.ts)';

grant update (conduct_version) on public.joey_applications to authenticated;
