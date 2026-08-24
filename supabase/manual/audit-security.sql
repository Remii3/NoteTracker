-- Read-only security audit for the current NoteTracker schema.

-- 1. RLS must be enabled on every exposed application table.
select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind = 'r'
  and relation.relname in ('chapters', 'topics')
order by relation.relname;

-- 2. Every operation must restrict rows to the signed-in owner.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('chapters', 'topics')
order by tablename, cmd, policyname;

-- 3. Check which API roles have table privileges.
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('chapters', 'topics')
  and grantee in ('anon', 'authenticated')
group by table_schema, table_name, grantee
order by table_name, grantee;

-- 4. RPC functions should be SECURITY INVOKER and have a fixed search_path.
select
  procedure.proname as function_name,
  pg_get_function_identity_arguments(procedure.oid) as arguments,
  procedure.prosecdef as security_definer,
  procedure.proconfig as configuration,
  procedure.proacl as access_control_list
from pg_proc as procedure
join pg_namespace as namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'get_learning_summary',
    'move_topic',
    'reorder_chapters',
    'reorder_topics'
  )
order by procedure.proname;

-- 5. Ownership columns used by RLS should be indexed.
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('chapters', 'topics')
order by tablename, indexname;

