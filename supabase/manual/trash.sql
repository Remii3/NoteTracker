begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.trash_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('module', 'chapter', 'topic', 'image', 'question', 'study_session')),
  item_id uuid not null,
  title text not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '1 day'),
  unique (item_type, item_id)
);

create index trash_items_user_deleted_idx on public.trash_items (user_id, deleted_at desc);
create index trash_items_purge_after_idx on public.trash_items (purge_after);

alter table public.trash_items enable row level security;
revoke all on table public.trash_items from anon, authenticated;
grant select, delete on table public.trash_items to authenticated;
create policy "Users read own trash" on public.trash_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users delete own trash" on public.trash_items for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.modules add column trash_id uuid references public.trash_items (id) on delete set null;
alter table public.chapters add column trash_id uuid references public.trash_items (id) on delete set null;
alter table public.topics add column trash_id uuid references public.trash_items (id) on delete set null;
alter table public.topic_images add column trash_id uuid references public.trash_items (id) on delete set null;
alter table public.questions add column trash_id uuid references public.trash_items (id) on delete set null;
alter table public.study_sessions add column trash_id uuid references public.trash_items (id) on delete set null;

create policy "Only active modules are readable" on public.modules as restrictive for select to authenticated
  using (trash_id is null);
create policy "Only active chapters are readable" on public.chapters as restrictive for select to authenticated
  using (trash_id is null);
create policy "Only active topics are readable" on public.topics as restrictive for select to authenticated
  using (trash_id is null);
create policy "Only active images are readable" on public.topic_images as restrictive for select to authenticated
  using (trash_id is null);
create policy "Only active questions are readable" on public.questions as restrictive for select to authenticated
  using (trash_id is null);
create policy "Only active sessions are readable" on public.study_sessions as restrictive for select to authenticated
  using (trash_id is null);
create policy "Only options of active questions are readable" on public.question_options as restrictive for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and q.trash_id is null));
create policy "Only items of active sessions are readable" on public.study_session_items as restrictive for select to authenticated
  using (exists (select 1 from public.study_sessions s where s.id = session_id and s.trash_id is null));

create index modules_active_idx on public.modules (user_id, position, id) where trash_id is null;
create index chapters_active_idx on public.chapters (module_id, position, id) where trash_id is null;
create index topics_active_idx on public.topics (chapter_id, position, id) where trash_id is null;
create index topic_images_active_idx on public.topic_images (topic_id, position, id) where trash_id is null;
create index questions_active_idx on public.questions (module_id, created_at desc) where trash_id is null;
create index study_sessions_active_idx on public.study_sessions (module_id, started_at desc) where trash_id is null;

drop index if exists public.modules_user_normalized_name_idx;
create unique index modules_user_normalized_name_idx
  on public.modules (user_id, lower(btrim(name))) where trash_id is null;

create or replace function private.move_to_trash(target_type text, target_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); batch_id uuid; item_title text;
begin
  if target_type = 'module' then
    select name into item_title from public.modules where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'chapter' then
    select title into item_title from public.chapters where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'topic' then
    select title into item_title from public.topics where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'image' then
    select original_filename into item_title from public.topic_images where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'question' then
    select left(content, 120) into item_title from public.questions where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'study_session' then
    select 'Sesja nauki z ' || to_char(started_at, 'YYYY-MM-DD HH24:MI') into item_title
      from public.study_sessions where id = target_id and user_id = owner_id and trash_id is null;
  else raise exception 'Nieobsługiwany typ elementu.';
  end if;
  if item_title is null then raise exception 'Nie znaleziono elementu.'; end if;

  insert into public.trash_items (user_id, item_type, item_id, title)
  values (owner_id, target_type, target_id, item_title) returning id into batch_id;

  if target_type = 'module' then
    update public.modules set trash_id = batch_id where id = target_id and user_id = owner_id;
    update public.chapters set trash_id = batch_id where module_id = target_id and user_id = owner_id and trash_id is null;
    update public.topics t set trash_id = batch_id from public.chapters c
      where t.chapter_id = c.id and c.module_id = target_id and t.user_id = owner_id and t.trash_id is null;
    update public.topic_images i set trash_id = batch_id from public.topics t join public.chapters c on c.id = t.chapter_id
      where i.topic_id = t.id and c.module_id = target_id and i.user_id = owner_id and i.trash_id is null;
    update public.questions set trash_id = batch_id where module_id = target_id and user_id = owner_id and trash_id is null;
    update public.study_sessions set trash_id = batch_id where module_id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'chapter' then
    update public.chapters set trash_id = batch_id where id = target_id and user_id = owner_id;
    update public.topics set trash_id = batch_id where chapter_id = target_id and user_id = owner_id and trash_id is null;
    update public.topic_images i set trash_id = batch_id from public.topics t
      where i.topic_id = t.id and t.chapter_id = target_id and i.user_id = owner_id and i.trash_id is null;
    update public.questions set trash_id = batch_id where chapter_id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'topic' then
    update public.topics set trash_id = batch_id where id = target_id and user_id = owner_id;
    update public.topic_images set trash_id = batch_id where topic_id = target_id and user_id = owner_id and trash_id is null;
    update public.questions set trash_id = batch_id where topic_id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'image' then update public.topic_images set trash_id = batch_id where id = target_id and user_id = owner_id;
  elsif target_type = 'question' then update public.questions set trash_id = batch_id where id = target_id and user_id = owner_id;
  else update public.study_sessions set trash_id = batch_id where id = target_id and user_id = owner_id;
  end if;
  return batch_id;
end; $$;

create or replace function private.restore_trash_item(target_trash_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if not exists (select 1 from public.trash_items where id = target_trash_id and user_id = owner_id)
    then raise exception 'Nie znaleziono elementu w koszu.'; end if;
  update public.modules set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.chapters set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.topics set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.topic_images set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.questions set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.study_sessions set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  delete from public.trash_items where id = target_trash_id and user_id = owner_id;
end; $$;

create or replace function private.get_trash_image_keys(target_trash_id uuid)
returns table(storage_key text) language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid; kind text; entity_id uuid;
begin
  select user_id, item_type, item_id into owner_id, kind, entity_id from public.trash_items where id = target_trash_id;
  if owner_id is null or ((select auth.uid()) is distinct from owner_id and (select auth.role()) <> 'service_role')
    then raise exception 'Nie znaleziono elementu w koszu.'; end if;
  return query select distinct i.storage_key from public.topic_images i
    join public.topics t on t.id = i.topic_id join public.chapters c on c.id = t.chapter_id
    where i.user_id = owner_id and (
      (kind = 'module' and c.module_id = entity_id) or (kind = 'chapter' and c.id = entity_id)
      or (kind = 'topic' and t.id = entity_id) or (kind = 'image' and i.id = entity_id));
end; $$;

create or replace function private.purge_trash_item(target_trash_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; kind text; entity_id uuid;
begin
  select user_id, item_type, item_id into owner_id, kind, entity_id from public.trash_items where id = target_trash_id;
  if owner_id is null or ((select auth.uid()) is distinct from owner_id and (select auth.role()) <> 'service_role')
    then raise exception 'Nie znaleziono elementu w koszu.'; end if;
  if kind = 'module' then delete from public.modules where id = entity_id and user_id = owner_id;
  elsif kind = 'chapter' then delete from public.chapters where id = entity_id and user_id = owner_id;
  elsif kind = 'topic' then delete from public.topics where id = entity_id and user_id = owner_id;
  elsif kind = 'image' then delete from public.topic_images where id = entity_id and user_id = owner_id;
  elsif kind = 'question' then delete from public.questions where id = entity_id and user_id = owner_id;
  else delete from public.study_sessions where id = entity_id and user_id = owner_id; end if;
  delete from public.trash_items where id = target_trash_id;
  delete from public.trash_items ti where ti.user_id = owner_id and (
    (ti.item_type = 'module' and not exists (select 1 from public.modules x where x.id = ti.item_id)) or
    (ti.item_type = 'chapter' and not exists (select 1 from public.chapters x where x.id = ti.item_id)) or
    (ti.item_type = 'topic' and not exists (select 1 from public.topics x where x.id = ti.item_id)) or
    (ti.item_type = 'image' and not exists (select 1 from public.topic_images x where x.id = ti.item_id)) or
    (ti.item_type = 'question' and not exists (select 1 from public.questions x where x.id = ti.item_id)) or
    (ti.item_type = 'study_session' and not exists (select 1 from public.study_sessions x where x.id = ti.item_id)));
end; $$;

create or replace function public.move_notes_to_trash(chapter_ids uuid[], topic_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare item_id uuid;
begin
  foreach item_id in array chapter_ids loop perform public.move_to_trash('chapter', item_id); end loop;
  foreach item_id in array topic_ids loop
    if exists (select 1 from public.topics where id = item_id and user_id = (select auth.uid()) and trash_id is null)
      then perform public.move_to_trash('topic', item_id); end if;
  end loop;
end; $$;

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
