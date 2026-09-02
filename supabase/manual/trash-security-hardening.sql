begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.move_to_trash(text, uuid) set schema private;
alter function public.restore_trash_item(uuid) set schema private;
alter function public.get_trash_image_keys(uuid) set schema private;
alter function public.purge_trash_item(uuid) set schema private;

create or replace function public.move_to_trash(target_type text, target_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.move_to_trash(target_type, target_id);
$$;

create or replace function public.restore_trash_item(target_trash_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.restore_trash_item(target_trash_id);
$$;

create or replace function public.get_trash_image_keys(target_trash_id uuid)
returns table(storage_key text) language sql stable security invoker set search_path = '' as $$
  select * from private.get_trash_image_keys(target_trash_id);
$$;

create or replace function public.purge_trash_item(target_trash_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.purge_trash_item(target_trash_id);
$$;

revoke all on function private.move_to_trash(text, uuid), private.restore_trash_item(uuid), private.get_trash_image_keys(uuid), private.purge_trash_item(uuid) from public, anon;
grant execute on function private.move_to_trash(text, uuid), private.restore_trash_item(uuid), private.get_trash_image_keys(uuid), private.purge_trash_item(uuid) to authenticated;
grant execute on function private.get_trash_image_keys(uuid), private.purge_trash_item(uuid) to service_role;

revoke all on function public.move_to_trash(text, uuid), public.restore_trash_item(uuid), public.get_trash_image_keys(uuid), public.purge_trash_item(uuid), public.move_notes_to_trash(uuid[], uuid[]) from public, anon;
grant execute on function public.move_to_trash(text, uuid), public.restore_trash_item(uuid), public.get_trash_image_keys(uuid), public.purge_trash_item(uuid), public.move_notes_to_trash(uuid[], uuid[]) to authenticated;
grant execute on function public.get_trash_image_keys(uuid), public.purge_trash_item(uuid) to service_role;

commit;

-- Oczekiwany wynik dla funkcji w public: security_definer=false,
-- anon_can_execute=false, authenticated_can_execute=true.
select
  n.nspname as function_schema,
  p.proname as function_name,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('move_to_trash', 'restore_trash_item', 'get_trash_image_keys', 'purge_trash_item')
order by p.proname;
