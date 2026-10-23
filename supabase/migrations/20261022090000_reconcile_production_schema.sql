-- Reconcile the historical SQL Editor schema with the versioned schema.

-- These RPCs belong to the retired topic-reading timer and are not called by
-- the current application. Its historical data is intentionally discarded.
-- Drop the functions before their backing table.
drop function if exists public.begin_topic_learning(uuid);
drop function if exists public.get_learning_statistics(uuid, integer, text);
drop function if exists public.record_topic_learning(bigint, integer);
drop function if exists public.import_flashcard_module(text, bigint, jsonb);
drop table if exists public.topic_learning_sessions;

-- Keep automatic RLS enforcement, but do not expose its SECURITY DEFINER
-- function through the public Data API schema.
drop event trigger if exists ensure_rls;
drop function if exists public.rls_auto_enable();

create or replace function private.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  command record;
begin
  for command in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if command.schema_name = 'public' then
      execute pg_catalog.format(
        'alter table if exists %s enable row level security',
        command.object_identity
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.rls_auto_enable()
  from public, anon, authenticated, service_role;

create event trigger ensure_rls
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function private.rls_auto_enable();

-- Normalize the chapter/topic ownership key and its dependent foreign key.
alter table public.topics
  drop constraint if exists topics_chapter_id_fkey;
alter table public.topics
  drop constraint if exists topics_chapter_owner_fkey;

alter table public.chapters
  drop constraint if exists chapters_id_user_id_key;
alter table public.chapters
  drop constraint if exists chapters_id_users_id_unique;
alter table public.chapters
  add constraint chapters_id_users_id_unique unique (id, user_id);

alter table public.topics
  add constraint topics_chapter_owner_fkey
  foreign key (chapter_id, user_id)
  references public.chapters (id, user_id)
  on delete cascade
  not valid;
alter table public.topics
  validate constraint topics_chapter_owner_fkey;

-- Use stable names and the same validation rules in every environment.
alter table public.chapters
  drop constraint if exists chapters_slug_check;
alter table public.chapters
  drop constraint if exists chapters_title_check;
alter table public.chapters
  drop constraint if exists chapters_slug_not_blank;
alter table public.chapters
  drop constraint if exists chapters_title_not_blank;
alter table public.chapters
  drop constraint if exists chapters_position_nonnegative;

alter table public.chapters
  add constraint chapters_slug_not_blank
  check (pg_catalog.btrim(slug) <> '') not valid;
alter table public.chapters
  add constraint chapters_title_not_blank
  check (pg_catalog.btrim(title) <> '') not valid;
alter table public.chapters
  add constraint chapters_position_nonnegative
  check (position >= 0) not valid;

alter table public.chapters validate constraint chapters_slug_not_blank;
alter table public.chapters validate constraint chapters_title_not_blank;
alter table public.chapters validate constraint chapters_position_nonnegative;

alter table public.topics
  drop constraint if exists topics_slug_check;
alter table public.topics
  drop constraint if exists topics_title_check;
alter table public.topics
  drop constraint if exists topics_slug_not_blank;
alter table public.topics
  drop constraint if exists topics_title_not_blank;
alter table public.topics
  drop constraint if exists topics_position_nonnegative;
alter table public.topics
  drop constraint if exists topics_content_is_object;

alter table public.topics
  add constraint topics_slug_not_blank
  check (pg_catalog.btrim(slug) <> '') not valid;
alter table public.topics
  add constraint topics_title_not_blank
  check (pg_catalog.btrim(title) <> '') not valid;
alter table public.topics
  add constraint topics_position_nonnegative
  check (position >= 0) not valid;
alter table public.topics
  add constraint topics_content_is_object
  check (pg_catalog.jsonb_typeof(content) = 'object') not valid;

alter table public.topics validate constraint topics_slug_not_blank;
alter table public.topics validate constraint topics_title_not_blank;
alter table public.topics validate constraint topics_position_nonnegative;
alter table public.topics validate constraint topics_content_is_object;

-- Slugs and titles are unique only among active topics in one chapter. This
-- allows a replacement to be created while an older topic remains in trash.
alter table public.topics
  drop constraint if exists topics_chapter_id_slug_key;
drop index if exists public.topics_chapter_id_slug_key;
drop index if exists public.topics_chapter_slug_idx;
drop index if exists public.topics_chapter_title_unique_idx;

create unique index topics_chapter_slug_idx
  on public.topics (chapter_id, slug)
  where trash_id is null;
create unique index topics_chapter_title_unique_idx
  on public.topics (chapter_id, pg_catalog.lower(pg_catalog.btrim(title)))
  where trash_id is null;

-- Normalize equivalent split/combined ownership policies.
drop policy if exists "Users manage own chapters" on public.chapters;
drop policy if exists "Users can create own chapters" on public.chapters;
drop policy if exists "Users can read own chapters" on public.chapters;
drop policy if exists "Users can update own chapters" on public.chapters;
drop policy if exists "Users can delete own chapters" on public.chapters;

create policy "Users can create own chapters"
on public.chapters for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can read own chapters"
on public.chapters for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can update own chapters"
on public.chapters for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete own chapters"
on public.chapters for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users manage own topics" on public.topics;
drop policy if exists "Users can create own topics" on public.topics;
drop policy if exists "Users can read own topics" on public.topics;
drop policy if exists "Users can update own topics" on public.topics;
drop policy if exists "Users can delete own topics" on public.topics;

create policy "Users can create own topics"
on public.topics for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can read own topics"
on public.topics for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can update own topics"
on public.topics for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete own topics"
on public.topics for delete to authenticated
using ((select auth.uid()) = user_id);

-- Supabase projects historically grant broad table privileges by default.
-- RLS does not protect TRUNCATE, so explicitly keep only application DML.
revoke all on table public.chapters, public.topics, public.topic_images
  from anon, authenticated;
grant select, insert, update, delete
  on table public.chapters, public.topics, public.topic_images
  to authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
