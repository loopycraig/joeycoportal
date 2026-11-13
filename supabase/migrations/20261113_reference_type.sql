-- Each reference has a type, matching the options on Clarify's c_reference.type field
-- (REFERENCE_TYPES in lib/joey/application.ts). Nullable so references added before this stay valid;
-- the portal requires it for new and edited references.

alter table public.joey_references
  add column if not exists reference_type text
  constraint joey_references_reference_type_check
  check (reference_type in ('Professional', 'Institutional', 'Landlord', 'Housemate', 'Personal'));

comment on column public.joey_references.reference_type is
  'Kind of reference, sent to Clarify c_reference.type';

grant insert (reference_type), update (reference_type) on public.joey_references to authenticated;
