-- Security advisor follow-ups for host_applications:
--  * Only signed-in users can call the Host application functions (Supabase grants anon EXECUTE by default).
--  * The updated_at trigger function gets a fixed search_path.

revoke execute on function public.ensure_my_host_application() from anon;
revoke execute on function public.submit_my_host_application() from anon;

alter function public.host_applications_before_update() set search_path = '';
