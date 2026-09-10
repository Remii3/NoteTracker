drop function public.get_progress_topics_page(
  uuid, text, integer, integer, integer, integer, uuid
);

create function public.get_progress_topics_page(
  target_module_id uuid,
  sort_mode text default 'chapter',
  page_size integer default 30,
  after_sort_rank integer default null,
  after_chapter_position bigint default null,
  after_topic_position bigint default null,
  after_topic_id uuid default null
) returns table (
  topic_id uuid,
  chapter_id uuid,
  chapter_title text,
  title text,
  completed boolean,
  first_completed_at timestamptz,
  sort_rank integer,
  chapter_position bigint,
  topic_position bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if sort_mode not in ('chapter', 'completed', 'incomplete')
    or page_size not between 1 and 50
    or (after_topic_id is not null and (
      after_sort_rank is null
      or after_chapter_position is null
      or after_topic_position is null
    ))
  then
    raise exception 'Nieprawidłowe parametry listy tematów.';
  end if;

  return query
  with ranked_topics as (
    select topic.id as topic_id,
      chapter.id as chapter_id,
      chapter.title as chapter_title,
      topic.title,
      topic.completed,
      topic.first_completed_at,
      case sort_mode
        when 'completed' then case when topic.completed then 0 else 1 end
        when 'incomplete' then case when topic.completed then 1 else 0 end
        else 0
      end as sort_rank,
      chapter.position as chapter_position,
      topic.position as topic_position
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    join public.modules as module
      on module.id = chapter.module_id
      and module.user_id = topic.user_id
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
      and chapter.trash_id is null
      and topic.trash_id is null
  )
  select ranked.topic_id,
    ranked.chapter_id,
    ranked.chapter_title,
    ranked.title,
    ranked.completed,
    ranked.first_completed_at,
    ranked.sort_rank,
    ranked.chapter_position,
    ranked.topic_position
  from ranked_topics as ranked
  where after_topic_id is null
    or (
      ranked.sort_rank,
      ranked.chapter_position,
      ranked.topic_position,
      ranked.topic_id
    ) > (
      after_sort_rank,
      after_chapter_position,
      after_topic_position,
      after_topic_id
    )
  order by ranked.sort_rank,
    ranked.chapter_position,
    ranked.topic_position,
    ranked.topic_id
  limit page_size + 1;
end;
$$;

revoke all on function public.get_progress_topics_page(
  uuid, text, integer, integer, bigint, bigint, uuid
) from public, anon;
grant execute on function public.get_progress_topics_page(
  uuid, text, integer, integer, bigint, bigint, uuid
) to authenticated;
