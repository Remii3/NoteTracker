-- Remove API access inherited by older RPCs from Supabase default privileges.
-- Authenticated RPC access remains controlled by the explicit grants captured
-- in the baseline migration.
revoke execute on all functions in schema public from public, anon;

-- This function is invoked only by its database trigger, not through the API.
revoke execute on function public.sync_chapter_questions_module()
  from authenticated;

-- Keep future public functions private until a migration explicitly grants
-- access to an API role.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
