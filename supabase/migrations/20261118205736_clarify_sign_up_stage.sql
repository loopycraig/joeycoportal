-- Joeys now reach Clarify when they sign up, at a "Sign Up" stage before Assignment.
-- In the portal that's still the draft step ("Finish your application").
update public.application_stages
   set clarify_values = array_prepend('Sign Up', clarify_values)
 where key = 'draft'
   and not ('Sign Up' = any (clarify_values));
