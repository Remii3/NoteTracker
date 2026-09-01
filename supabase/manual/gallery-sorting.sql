begin;

create or replace function public.get_module_gallery_images(
  target_module_id uuid,
  sort_mode text,
  page_offset integer default 0,
  page_limit integer default 13
)
returns table (
  id uuid,
  topic_id uuid,
  storage_key text,
  original_filename text,
  format text,
  width integer,
  height integer,
  bytes bigint,
  image_position bigint,
  topic_title text,
  topic_slug text,
  chapter_id uuid,
  chapter_title text,
  chapter_slug text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if sort_mode not in ('manual', 'az', 'za', 'completed', 'incomplete')
    or page_offset < 0 or page_limit < 1 or page_limit > 25
  then raise exception 'Nieprawidłowe sortowanie lub paginacja galerii.'; end if;

  return query
  with chapter_progress as (
    select chapter.id,
      count(topic.id) > 0 and bool_and(topic.completed) as completed
    from public.chapters as chapter
    left join public.topics as topic on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
    group by chapter.id
  )
  select image.id, image.topic_id, image.storage_key,
    image.original_filename, image.format, image.width, image.height,
    image.bytes, image.position, topic.title, topic.slug,
    chapter.id, chapter.title, chapter.slug
  from public.topic_images as image
  join public.topics as topic on topic.id = image.topic_id
    and topic.user_id = image.user_id
  join public.chapters as chapter on chapter.id = topic.chapter_id
    and chapter.user_id = topic.user_id
  join chapter_progress as progress on progress.id = chapter.id
  where chapter.module_id = target_module_id
    and image.user_id = (select auth.uid())
  order by
    case when sort_mode = 'completed' then progress.completed::integer end desc,
    case when sort_mode = 'incomplete' then progress.completed::integer end asc,
    case when sort_mode in ('manual', 'completed', 'incomplete') then chapter.position end asc,
    case when sort_mode = 'az' then lower(chapter.title) end asc,
    case when sort_mode = 'za' then lower(chapter.title) end desc,
    chapter.id,
    topic.position,
    image.position,
    image.id
  offset page_offset limit page_limit;
end;
$$;

revoke all on function public.get_module_gallery_images(uuid, text, integer, integer) from public;
grant execute on function public.get_module_gallery_images(uuid, text, integer, integer) to authenticated;

drop function if exists public.get_module_gallery_sections(uuid, text, integer);

create or replace function public.get_module_gallery_sections(
  target_module_id uuid,
  sort_mode text,
  per_chapter_limit integer default 4,
  chapter_offset integer default 0,
  chapter_limit integer default 7
)
returns table (
  id uuid, topic_id uuid, storage_key text, original_filename text,
  format text, width integer, height integer, bytes bigint,
  image_position bigint, topic_title text, topic_slug text,
  chapter_id uuid, chapter_title text, chapter_slug text,
  chapter_total bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if sort_mode not in ('manual', 'az', 'za', 'completed', 'incomplete')
    or per_chapter_limit < 1 or per_chapter_limit > 12
    or chapter_offset < 0 or chapter_limit < 1 or chapter_limit > 13
  then raise exception 'Nieprawidłowe sortowanie galerii.'; end if;

  return query
  with chapter_progress as (
    select chapter.id, chapter.title, chapter.slug, chapter.position,
      count(topic.id) > 0 and bool_and(topic.completed) as completed
    from public.chapters as chapter
    left join public.topics as topic on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
    group by chapter.id, chapter.title, chapter.slug, chapter.position
  ), selected_chapters as (
    select progress.*
    from chapter_progress as progress
    where exists (
      select 1
      from public.topics as topic
      join public.topic_images as image on image.topic_id = topic.id
        and image.user_id = topic.user_id
      where topic.chapter_id = progress.id
        and topic.user_id = (select auth.uid())
    )
    order by
      case when sort_mode = 'completed' then progress.completed::integer end desc,
      case when sort_mode = 'incomplete' then progress.completed::integer end asc,
      case when sort_mode in ('manual', 'completed', 'incomplete') then progress.position end asc,
      case when sort_mode = 'az' then lower(progress.title) end asc,
      case when sort_mode = 'za' then lower(progress.title) end desc,
      progress.id
    offset chapter_offset limit chapter_limit
  ), ranked as (
    select image.id, image.topic_id, image.storage_key,
      image.original_filename, image.format, image.width, image.height,
      image.bytes, image.position as image_position,
      topic.title as topic_title, topic.slug as topic_slug,
      topic.position as topic_position,
      chapter.id as chapter_id, chapter.title as chapter_title,
      chapter.slug as chapter_slug, chapter.position as chapter_position,
      progress.completed as chapter_completed,
      count(*) over (partition by chapter.id) as chapter_total,
      row_number() over (
        partition by chapter.id order by topic.position, image.position, image.id
      ) as chapter_row
    from public.topic_images as image
    join public.topics as topic on topic.id = image.topic_id
      and topic.user_id = image.user_id
    join public.chapters as chapter on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    join selected_chapters as progress on progress.id = chapter.id
    where chapter.module_id = target_module_id
      and image.user_id = (select auth.uid())
  )
  select ranked.id, ranked.topic_id, ranked.storage_key,
    ranked.original_filename, ranked.format, ranked.width, ranked.height,
    ranked.bytes, ranked.image_position, ranked.topic_title,
    ranked.topic_slug, ranked.chapter_id, ranked.chapter_title,
    ranked.chapter_slug, ranked.chapter_total
  from ranked
  where ranked.chapter_row <= per_chapter_limit
  order by
    case when sort_mode = 'completed' then ranked.chapter_completed::integer end desc,
    case when sort_mode = 'incomplete' then ranked.chapter_completed::integer end asc,
    case when sort_mode in ('manual', 'completed', 'incomplete') then ranked.chapter_position end asc,
    case when sort_mode = 'az' then lower(ranked.chapter_title) end asc,
    case when sort_mode = 'za' then lower(ranked.chapter_title) end desc,
    ranked.chapter_id, ranked.topic_position, ranked.image_position, ranked.id;
end;
$$;

create or replace function public.get_chapter_gallery_images(
  target_module_id uuid,
  target_chapter_id uuid,
  page_offset integer default 0,
  page_limit integer default 5
)
returns table (
  id uuid, topic_id uuid, storage_key text, original_filename text,
  format text, width integer, height integer, bytes bigint,
  image_position bigint, topic_title text, topic_slug text,
  chapter_id uuid, chapter_title text, chapter_slug text,
  chapter_total bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if page_offset < 0 or page_limit < 1 or page_limit > 13
  then raise exception 'Nieprawidłowa paginacja galerii.'; end if;

  return query
  select image.id, image.topic_id, image.storage_key,
    image.original_filename, image.format, image.width, image.height,
    image.bytes, image.position, topic.title, topic.slug,
    chapter.id, chapter.title, chapter.slug,
    count(*) over () as chapter_total
  from public.topic_images as image
  join public.topics as topic on topic.id = image.topic_id
    and topic.user_id = image.user_id
  join public.chapters as chapter on chapter.id = topic.chapter_id
    and chapter.user_id = topic.user_id
  where chapter.module_id = target_module_id
    and chapter.id = target_chapter_id
    and image.user_id = (select auth.uid())
  order by topic.position, image.position, image.id
  offset page_offset limit page_limit;
end;
$$;

revoke all on function public.get_module_gallery_sections(uuid, text, integer, integer, integer) from public;
revoke all on function public.get_chapter_gallery_images(uuid, uuid, integer, integer) from public;
grant execute on function public.get_module_gallery_sections(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.get_chapter_gallery_images(uuid, uuid, integer, integer) to authenticated;

commit;
