-- One-time JoeyCo fees (search fee, match fee) go out in their own run on the day they're due,
-- rather than waiting for the monthly statement. Its own migration: a new enum value can't be used
-- in the transaction that adds it.
alter type public.run_kind add value if not exists 'host_fee';
