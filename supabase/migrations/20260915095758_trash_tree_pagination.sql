begin;

create index if not exists trash_items_user_deleted_id_idx
  on public.trash_items (user_id, deleted_at desc, id desc);
drop index if exists public.trash_items_user_deleted_idx;

create index if not exists modules_trash_id_idx
  on public.modules (trash_id) where trash_id is not null;
create index if not exists chapters_trash_id_idx
  on public.chapters (trash_id) where trash_id is not null;
create index if not exists topics_trash_id_idx
  on public.topics (trash_id) where trash_id is not null;
create index if not exists topic_images_trash_id_idx
  on public.topic_images (trash_id) where trash_id is not null;
create index if not exists questions_trash_id_idx
  on public.questions (trash_id) where trash_id is not null;
create index if not exists study_sessions_trash_id_idx
  on public.study_sessions (trash_id) where trash_id is not null;

create or replace function private.build_trash_tree(
  target_trash_id uuid,
  target_type text,
  target_item_id uuid,
  target_title text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  child_nodes jsonb := '[]'::jsonb;
  root_deleted boolean := false;
begin
  select trash.user_id
  into owner_id
  from public.trash_items as trash
  where trash.id = target_trash_id;

  if owner_id is null then
    return null;
  end if;

  if target_type = 'module' then
    select exists (
      select 1 from public.modules as module
      where module.id = target_item_id
        and module.user_id = owner_id
        and module.trash_id = target_trash_id
    ) into root_deleted;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', chapter.id,
          'type', 'chapter',
          'title', chapter.title,
          'is_deleted', chapter.trash_id = target_trash_id,
          'children', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', topic.id,
                'type', 'topic',
                'title', topic.title,
                'is_deleted', true,
                'children', '[]'::jsonb
              ) order by topic.position, topic.id
            )
            from public.topics as topic
            where topic.chapter_id = chapter.id
              and topic.user_id = owner_id
              and topic.trash_id = target_trash_id
          ), '[]'::jsonb)
        ) order by chapter.position, chapter.id
      ),
      '[]'::jsonb
    )
    into child_nodes
    from public.chapters as chapter
    where chapter.module_id = target_item_id
      and chapter.user_id = owner_id
      and (
        chapter.trash_id = target_trash_id
        or exists (
          select 1
          from public.topics as topic
          where topic.chapter_id = chapter.id
            and topic.user_id = owner_id
            and topic.trash_id = target_trash_id
        )
      );
  elsif target_type = 'chapter' then
    select exists (
      select 1 from public.chapters as chapter
      where chapter.id = target_item_id
        and chapter.user_id = owner_id
        and chapter.trash_id = target_trash_id
    ) into root_deleted;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', topic.id,
          'type', 'topic',
          'title', topic.title,
          'is_deleted', true,
          'children', '[]'::jsonb
        ) order by topic.position, topic.id
      ),
      '[]'::jsonb
    )
    into child_nodes
    from public.topics as topic
    where topic.chapter_id = target_item_id
      and topic.user_id = owner_id
      and topic.trash_id = target_trash_id;
  elsif target_type = 'topic' then
    select exists (
      select 1 from public.topics as topic
      where topic.id = target_item_id
        and topic.user_id = owner_id
        and topic.trash_id = target_trash_id
    ) into root_deleted;
  elsif target_type = 'image' then
    select exists (
      select 1 from public.topic_images as image
      where image.id = target_item_id
        and image.user_id = owner_id
        and image.trash_id = target_trash_id
    ) into root_deleted;
  elsif target_type = 'question' then
    select exists (
      select 1 from public.questions as question
      where question.id = target_item_id
        and question.user_id = owner_id
        and question.trash_id = target_trash_id
    ) into root_deleted;
  elsif target_type = 'study_session' then
    select exists (
      select 1 from public.study_sessions as session
      where session.id = target_item_id
        and session.user_id = owner_id
        and session.trash_id = target_trash_id
    ) into root_deleted;
  end if;

  return jsonb_build_object(
    'id', target_item_id,
    'type', target_type,
    'title', target_title,
    'is_deleted', root_deleted,
    'children', child_nodes
  );
end;
$$;

create or replace function private.list_trash_items_page(
  page_cursor_deleted_at timestamptz default null,
  page_cursor_id uuid default null,
  requested_page_size integer default 10
)
returns table (
  id uuid,
  item_type text,
  item_id uuid,
  title text,
  deleted_at timestamptz,
  purge_after timestamptz,
  source_path text[],
  tree jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  safe_page_size integer := least(greatest(coalesce(requested_page_size, 10), 1), 50);
begin
  if owner_id is null then
    raise exception 'Sesja wygasła.';
  end if;
  if (page_cursor_deleted_at is null) <> (page_cursor_id is null) then
    raise exception 'Nieprawidłowy kursor strony.';
  end if;

  return query
  with selected_items as materialized (
    select trash.*
    from public.trash_items as trash
    where trash.user_id = owner_id
      and (
        page_cursor_deleted_at is null
        or (trash.deleted_at, trash.id) < (page_cursor_deleted_at, page_cursor_id)
      )
    order by trash.deleted_at desc, trash.id desc
    limit safe_page_size + 1
  )
  select
    selected.id,
    selected.item_type,
    selected.item_id,
    selected.title,
    selected.deleted_at,
    selected.purge_after,
    case selected.item_type
      when 'chapter' then array_remove(array[
        (select module.name
         from public.chapters as chapter
         join public.modules as module on module.id = chapter.module_id
         where chapter.id = selected.item_id and chapter.user_id = owner_id)
      ], null)
      when 'topic' then array_remove(array[
        (select module.name
         from public.topics as topic
         join public.chapters as chapter on chapter.id = topic.chapter_id
         join public.modules as module on module.id = chapter.module_id
         where topic.id = selected.item_id and topic.user_id = owner_id),
        (select chapter.title
         from public.topics as topic
         join public.chapters as chapter on chapter.id = topic.chapter_id
         where topic.id = selected.item_id and topic.user_id = owner_id)
      ], null)
      when 'image' then array_remove(array[
        (select module.name
         from public.topic_images as image
         join public.topics as topic on topic.id = image.topic_id
         join public.chapters as chapter on chapter.id = topic.chapter_id
         join public.modules as module on module.id = chapter.module_id
         where image.id = selected.item_id and image.user_id = owner_id),
        (select chapter.title
         from public.topic_images as image
         join public.topics as topic on topic.id = image.topic_id
         join public.chapters as chapter on chapter.id = topic.chapter_id
         where image.id = selected.item_id and image.user_id = owner_id),
        (select topic.title
         from public.topic_images as image
         join public.topics as topic on topic.id = image.topic_id
         where image.id = selected.item_id and image.user_id = owner_id)
      ], null)
      when 'question' then array_remove(array[
        (select module.name
         from public.questions as question
         join public.modules as module on module.id = question.module_id
         where question.id = selected.item_id and question.user_id = owner_id),
        (select chapter.title
         from public.questions as question
         join public.chapters as chapter on chapter.id = question.chapter_id
         where question.id = selected.item_id and question.user_id = owner_id),
        (select topic.title
         from public.questions as question
         join public.topics as topic on topic.id = question.topic_id
         where question.id = selected.item_id and question.user_id = owner_id)
      ], null)
      when 'study_session' then array_remove(array[
        (select module.name
         from public.study_sessions as session
         join public.modules as module on module.id = session.module_id
         where session.id = selected.item_id and session.user_id = owner_id)
      ], null)
      else array[]::text[]
    end as source_path,
    private.build_trash_tree(
      selected.id,
      selected.item_type,
      selected.item_id,
      selected.title
    ) as tree,
    (select count(*) from public.trash_items as counted where counted.user_id = owner_id) as total_count
  from selected_items as selected
  order by selected.deleted_at desc, selected.id desc;
end;
$$;

create or replace function private.restore_trash_node(
  target_trash_id uuid,
  target_node_type text,
  target_node_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  root_type text;
  root_id uuid;
  ancestor_module_id uuid;
  ancestor_chapter_id uuid;
  ancestor_topic_id uuid;
  restore_whole_event boolean := false;
begin
  if owner_id is null then
    raise exception 'Sesja wygasła.';
  end if;

  select trash.item_type, trash.item_id
  into root_type, root_id
  from public.trash_items as trash
  where trash.id = target_trash_id and trash.user_id = owner_id
  for update;

  if root_type is null then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  restore_whole_event := target_node_type = root_type and target_node_id = root_id;

  if restore_whole_event then
    if root_type = 'chapter' then
      select chapter.module_id
      into ancestor_module_id
      from public.chapters as chapter
      where chapter.id = root_id and chapter.user_id = owner_id;
    elsif root_type = 'topic' then
      select chapter.module_id, topic.chapter_id
      into ancestor_module_id, ancestor_chapter_id
      from public.topics as topic
      join public.chapters as chapter on chapter.id = topic.chapter_id
      where topic.id = root_id and topic.user_id = owner_id;
    elsif root_type = 'image' then
      select chapter.module_id, topic.chapter_id, image.topic_id
      into ancestor_module_id, ancestor_chapter_id, ancestor_topic_id
      from public.topic_images as image
      join public.topics as topic on topic.id = image.topic_id
      join public.chapters as chapter on chapter.id = topic.chapter_id
      where image.id = root_id and image.user_id = owner_id;
    elsif root_type = 'question' then
      select question.module_id, question.chapter_id, question.topic_id
      into ancestor_module_id, ancestor_chapter_id, ancestor_topic_id
      from public.questions as question
      where question.id = root_id and question.user_id = owner_id;
    elsif root_type = 'study_session' then
      select session.module_id
      into ancestor_module_id
      from public.study_sessions as session
      where session.id = root_id and session.user_id = owner_id;
    end if;
  elsif target_node_type = 'chapter' and root_type = 'module' then
    select chapter.module_id
    into ancestor_module_id
    from public.chapters as chapter
    where chapter.id = target_node_id
      and chapter.module_id = root_id
      and chapter.user_id = owner_id
      and chapter.trash_id = target_trash_id;
  elsif target_node_type = 'topic' and root_type in ('module', 'chapter') then
    select chapter.module_id, topic.chapter_id
    into ancestor_module_id, ancestor_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = target_node_id
      and topic.user_id = owner_id
      and topic.trash_id = target_trash_id
      and (
        (root_type = 'module' and chapter.module_id = root_id)
        or (root_type = 'chapter' and chapter.id = root_id)
      );
  else
    raise exception 'Nie znaleziono elementu w tym drzewie kosza.';
  end if;

  if not restore_whole_event and ancestor_module_id is null then
    raise exception 'Nie znaleziono elementu w tym drzewie kosza.';
  end if;

  if ancestor_module_id is not null then
    update public.modules
    set trash_id = null
    where id = ancestor_module_id and user_id = owner_id;
  end if;
  if ancestor_chapter_id is not null then
    update public.chapters
    set trash_id = null
    where id = ancestor_chapter_id and user_id = owner_id;
  end if;
  if ancestor_topic_id is not null then
    update public.topics
    set trash_id = null
    where id = ancestor_topic_id and user_id = owner_id;
  end if;

  if restore_whole_event then
    update public.modules set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.chapters set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.topics set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.topic_images set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.questions set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.study_sessions set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
  elsif target_node_type = 'chapter' then
    update public.chapters set trash_id = null
      where id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.topics set trash_id = null
      where chapter_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.topic_images as image
      set trash_id = null
      from public.topics as topic
      where image.topic_id = topic.id
        and topic.chapter_id = target_node_id
        and image.user_id = owner_id
        and image.trash_id = target_trash_id;
    update public.questions set trash_id = null
      where chapter_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
  elsif target_node_type = 'topic' then
    update public.topics set trash_id = null
      where id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.topic_images set trash_id = null
      where topic_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.questions set trash_id = null
      where topic_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
  end if;

  delete from public.trash_items as trash
  where trash.user_id = owner_id
    and not exists (select 1 from public.modules as module where module.trash_id = trash.id)
    and not exists (select 1 from public.chapters as chapter where chapter.trash_id = trash.id)
    and not exists (select 1 from public.topics as topic where topic.trash_id = trash.id)
    and not exists (select 1 from public.topic_images as image where image.trash_id = trash.id)
    and not exists (select 1 from public.questions as question where question.trash_id = trash.id)
    and not exists (select 1 from public.study_sessions as session where session.trash_id = trash.id);
end;
$$;

create or replace function private.restore_trash_item(target_trash_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  root_type text;
  root_id uuid;
begin
  select trash.item_type, trash.item_id
  into root_type, root_id
  from public.trash_items as trash
  where trash.id = target_trash_id and trash.user_id = owner_id;

  if root_type is null then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  perform private.restore_trash_node(target_trash_id, root_type, root_id);
end;
$$;

create or replace function private.get_trash_image_keys(target_trash_id uuid)
returns table(storage_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  kind text;
  entity_id uuid;
  root_will_be_deleted boolean := false;
begin
  select trash.user_id, trash.item_type, trash.item_id
  into owner_id, kind, entity_id
  from public.trash_items as trash
  where trash.id = target_trash_id;

  if owner_id is null
     or (
       (select auth.uid()) is distinct from owner_id
       and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     ) then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  root_will_be_deleted :=
    (kind = 'module' and exists (
      select 1 from public.modules as module
      where module.id = entity_id and module.user_id = owner_id and module.trash_id = target_trash_id
    ))
    or (kind = 'chapter' and exists (
      select 1 from public.chapters as chapter
      where chapter.id = entity_id and chapter.user_id = owner_id and chapter.trash_id = target_trash_id
    ))
    or (kind = 'topic' and exists (
      select 1 from public.topics as topic
      where topic.id = entity_id and topic.user_id = owner_id and topic.trash_id = target_trash_id
    ));

  return query
  select distinct image.storage_key
  from public.topic_images as image
  join public.topics as topic on topic.id = image.topic_id
  join public.chapters as chapter on chapter.id = topic.chapter_id
  where image.user_id = owner_id
    and (
      image.trash_id = target_trash_id
      or (
        root_will_be_deleted
        and (
          (kind = 'module' and chapter.module_id = entity_id)
          or (kind = 'chapter' and chapter.id = entity_id)
          or (kind = 'topic' and topic.id = entity_id)
        )
      )
    );
end;
$$;

create or replace function private.purge_trash_item(target_trash_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select trash.user_id
  into owner_id
  from public.trash_items as trash
  where trash.id = target_trash_id
  for update;

  if owner_id is null
     or (
       (select auth.uid()) is distinct from owner_id
       and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     ) then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  delete from public.topic_images where trash_id = target_trash_id and user_id = owner_id;
  delete from public.questions where trash_id = target_trash_id and user_id = owner_id;
  delete from public.study_sessions where trash_id = target_trash_id and user_id = owner_id;
  delete from public.topics where trash_id = target_trash_id and user_id = owner_id;
  delete from public.chapters where trash_id = target_trash_id and user_id = owner_id;
  delete from public.modules where trash_id = target_trash_id and user_id = owner_id;
  delete from public.trash_items where id = target_trash_id and user_id = owner_id;

  delete from public.trash_items as trash
  where trash.user_id = owner_id
    and not exists (select 1 from public.modules as module where module.trash_id = trash.id)
    and not exists (select 1 from public.chapters as chapter where chapter.trash_id = trash.id)
    and not exists (select 1 from public.topics as topic where topic.trash_id = trash.id)
    and not exists (select 1 from public.topic_images as image where image.trash_id = trash.id)
    and not exists (select 1 from public.questions as question where question.trash_id = trash.id)
    and not exists (select 1 from public.study_sessions as session where session.trash_id = trash.id);
end;
$$;

create or replace function public.list_trash_items_page(
  page_cursor_deleted_at timestamptz default null,
  page_cursor_id uuid default null,
  requested_page_size integer default 10
)
returns table (
  id uuid,
  item_type text,
  item_id uuid,
  title text,
  deleted_at timestamptz,
  purge_after timestamptz,
  source_path text[],
  tree jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.list_trash_items_page(
    page_cursor_deleted_at,
    page_cursor_id,
    requested_page_size
  );
$$;

create or replace function public.restore_trash_node(
  target_trash_id uuid,
  target_node_type text,
  target_node_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.restore_trash_node(
    target_trash_id,
    target_node_type,
    target_node_id
  );
$$;

revoke all on function private.build_trash_tree(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function private.list_trash_items_page(timestamptz, uuid, integer) from public, anon;
revoke all on function private.restore_trash_node(uuid, text, uuid) from public, anon;
grant execute on function private.list_trash_items_page(timestamptz, uuid, integer) to authenticated;
grant execute on function private.restore_trash_node(uuid, text, uuid) to authenticated;

revoke all on function public.list_trash_items_page(timestamptz, uuid, integer) from public, anon;
revoke all on function public.restore_trash_node(uuid, text, uuid) from public, anon;
grant execute on function public.list_trash_items_page(timestamptz, uuid, integer) to authenticated;
grant execute on function public.restore_trash_node(uuid, text, uuid) to authenticated;

commit;
