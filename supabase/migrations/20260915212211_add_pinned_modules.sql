alter table public.modules
  add column is_pinned boolean not null default false;

create index modules_user_pinned_name_idx
  on public.modules (user_id, is_pinned desc, lower(name), id)
  where trash_id is null;

drop function public.get_module_summaries(uuid, text);

create function public.get_module_summaries(
  target_module_id uuid default null,
  target_module_slug text default null
)
returns table (
  id uuid,
  slug text,
  name text,
  is_pinned boolean,
  module_position integer,
  chapters_count integer,
  completed_chapters_count integer,
  topics_count integer,
  completed_topics_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with chapter_progress as (
    select chapter.id, chapter.module_id,
      count(topic.id)::integer as topics_count,
      count(topic.id) filter (where topic.completed)::integer
        as completed_topics_count
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = chapter.user_id
      and topic.trash_id is null
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
    group by chapter.id, chapter.module_id
  )
  select module.id, module.slug, module.name, module.is_pinned,
    module.position as module_position,
    count(chapter.id)::integer as chapters_count,
    count(chapter.id) filter (
      where chapter.topics_count > 0
        and chapter.completed_topics_count = chapter.topics_count
    )::integer as completed_chapters_count,
    coalesce(sum(chapter.topics_count), 0)::integer as topics_count,
    coalesce(sum(chapter.completed_topics_count), 0)::integer
      as completed_topics_count
  from public.modules as module
  left join chapter_progress as chapter on chapter.module_id = module.id
  where module.user_id = (select auth.uid())
    and module.trash_id is null
    and (target_module_id is null or module.id = target_module_id)
    and (target_module_slug is null or module.slug = target_module_slug)
  group by module.id, module.slug, module.name, module.is_pinned,
    module.position
  order by module.is_pinned desc, lower(module.name), module.name, module.id;
$$;

revoke all on function public.get_module_summaries(uuid, text)
  from public, anon;
grant execute on function public.get_module_summaries(uuid, text)
  to authenticated;
