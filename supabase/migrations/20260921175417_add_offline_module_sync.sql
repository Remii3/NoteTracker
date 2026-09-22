alter table public.modules
  add column updated_at timestamptz not null default now();
alter table public.chapters
  add column updated_at timestamptz not null default now();
alter table public.topics
  add column updated_at timestamptz not null default now();
alter table public.topic_images
  add column updated_at timestamptz not null default now();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger set_modules_updated_at
before update on public.modules
for each row execute function private.set_updated_at();

create trigger set_chapters_updated_at
before update on public.chapters
for each row execute function private.set_updated_at();

create trigger set_topics_updated_at
before update on public.topics
for each row execute function private.set_updated_at();

create trigger set_topic_images_updated_at
before update on public.topic_images
for each row execute function private.set_updated_at();

create index chapters_offline_sync_idx
  on public.chapters (module_id, user_id, updated_at, id)
  where trash_id is null;
create index topics_offline_sync_idx
  on public.topics (chapter_id, user_id, updated_at, id)
  where trash_id is null;
create index topic_images_offline_sync_idx
  on public.topic_images (topic_id, user_id, updated_at, id)
  where trash_id is null;

create function public.get_offline_module_changes(
  target_module_id uuid,
  changed_since timestamptz default null,
  include_images boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with sync_boundary as (
    -- Keep a small overlap so a transaction that started before this snapshot
    -- and commits just after it cannot fall behind the next cursor.
    select statement_timestamp() - interval '1 minute' as server_time
  ), selected_module as (
    select module.id, module.slug, module.name, module.is_pinned,
      module.position, module.updated_at
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ), active_chapters as (
    select chapter.id, chapter.module_id, chapter.slug, chapter.title,
      chapter.position, chapter.updated_at
    from public.chapters as chapter
    join selected_module as module on module.id = chapter.module_id
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
  ), active_topics as (
    select topic.id, topic.chapter_id, topic.slug, topic.title, topic.content,
      topic.completed, topic.position, topic.updated_at
    from public.topics as topic
    join active_chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
  ), active_images as (
    select image.id, image.topic_id, image.storage_key,
      image.original_filename, image.format, image.width, image.height,
      image.bytes, image.position, image.updated_at
    from public.topic_images as image
    join active_topics as topic on topic.id = image.topic_id
    where include_images
      and image.user_id = (select auth.uid())
      and image.trash_id is null
  )
  select jsonb_build_object(
    'serverTime', boundary.server_time,
    'module', jsonb_build_object(
      'id', module.id,
      'slug', module.slug,
      'name', module.name,
      'isPinned', module.is_pinned,
      'position', module.position,
      'updatedAt', module.updated_at
    ),
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', chapter.id,
        'moduleId', chapter.module_id,
        'slug', chapter.slug,
        'title', chapter.title,
        'position', chapter.position,
        'updatedAt', chapter.updated_at
      ) order by chapter.position, chapter.id)
      from active_chapters as chapter
      where changed_since is null or chapter.updated_at > changed_since
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', topic.id,
        'chapterId', topic.chapter_id,
        'slug', topic.slug,
        'title', topic.title,
        'content', topic.content,
        'completed', topic.completed,
        'position', topic.position,
        'updatedAt', topic.updated_at
      ) order by topic.chapter_id, topic.position, topic.id)
      from active_topics as topic
      where changed_since is null or topic.updated_at > changed_since
    ), '[]'::jsonb),
    'activeChapterIds', coalesce((
      select jsonb_agg(chapter.id order by chapter.id)
      from active_chapters as chapter
    ), '[]'::jsonb),
    'activeTopicIds', coalesce((
      select jsonb_agg(topic.id order by topic.id)
      from active_topics as topic
    ), '[]'::jsonb),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', image.id,
        'topicId', image.topic_id,
        'storageKey', image.storage_key,
        'originalFilename', image.original_filename,
        'format', image.format,
        'width', image.width,
        'height', image.height,
        'bytes', image.bytes,
        'position', image.position,
        'updatedAt', image.updated_at
      ) order by image.topic_id, image.position, image.id)
      from active_images as image
    ), '[]'::jsonb)
  )
  from selected_module as module
  cross join sync_boundary as boundary;
$$;

revoke all on function public.get_offline_module_changes(
  uuid, timestamptz, boolean
) from public, anon;
grant execute on function public.get_offline_module_changes(
  uuid, timestamptz, boolean
) to authenticated;
