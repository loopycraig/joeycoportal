-- Matches created from Clarify. When a Match (deal) reaches Contracting, the portal creates the match
-- so the offer letter and housing license can be signed here. A Host or Joey who hasn't signed up yet
-- gets a placeholder account (no password), which they claim by signing up with the same email.

alter table public.matches
  add column clarify_deal_id text unique;

comment on column public.matches.clarify_deal_id is
  'The Clarify deal this match was created from, if any. One portal match per deal.';

alter table public.profiles
  add column is_placeholder boolean not null default false;

comment on column public.profiles.is_placeholder is
  'Created by the Clarify deal sync before the person signed up. Cleared the first time they sign in.';

-- The first sign-in (after setting a password from the emailed link) claims the placeholder.
create or replace function public.claim_placeholder_on_sign_in() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is not null and old.last_sign_in_at is null then
    update public.profiles set is_placeholder = false where id = new.id and is_placeholder;
  end if;
  return new;
end $$;

revoke all on function public.claim_placeholder_on_sign_in() from public, anon, authenticated;

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in after update of last_sign_in_at on auth.users
  for each row execute function public.claim_placeholder_on_sign_in();
