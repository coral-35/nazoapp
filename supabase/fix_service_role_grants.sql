-- Non-destructive patch for existing Supabase projects.
-- Run this in the Supabase SQL Editor if the server API returns:
--   42501 permission denied for table rooms
--
-- These grants are only for the server-side service_role used by API routes.
-- They do not grant table access to anon or authenticated browser clients.

grant usage on schema public to service_role;

grant select, insert, update on table public.rooms to service_role;
grant select, insert, update on table public.participants to service_role;
grant select, insert, update on table public.questions to service_role;
grant select, insert on table public.answer_aliases to service_role;
grant select, insert, update on table public.submissions to service_role;
grant select, insert on table public.score_events to service_role;

grant execute on function public.increment_participant_score(uuid, integer) to service_role;
