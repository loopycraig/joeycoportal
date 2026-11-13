-- Map every Clarify c_joey.vetting_stage option to a portal stage.
-- apply_clarify_stage() matches these case-insensitively; an unlisted value is ignored ("unmapped").
-- Clarify has no background check stage (it tracks that in background_check_status),
-- so the background_check step is left without a Clarify value for now.

update public.application_stages set clarify_values = array['Assignment', 'Scheduling + Intro Call'] where key = 'in_review';
update public.application_stages set clarify_values = array['Screening'] where key = 'reference_check';
update public.application_stages set clarify_values = array[]::text[] where key = 'background_check';
update public.application_stages set clarify_values = array['Match Ready'] where key = 'approved';
update public.application_stages set clarify_values = array['Matched', 'Completed'] where key = 'matched';
update public.application_stages set clarify_values = array['Keep Warm', 'Inactive'] where key = 'on_hold';
update public.application_stages set clarify_values = array['Rejected', 'Suspected Spam / Bot'] where key = 'not_moving_forward';
