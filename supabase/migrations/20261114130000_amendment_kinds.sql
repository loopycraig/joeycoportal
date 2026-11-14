-- New agreement kinds. Enum values have to be committed before anything uses them, so they get
-- their own migration (the next one uses them).
alter type public.agreement_kind add value if not exists 'pay_amendment';
alter type public.agreement_kind add value if not exists 'rent_amendment';
alter type public.agreement_kind add value if not exists 'pay_schedule_notice';
alter type public.agreement_kind add value if not exists 'termination_notice';
