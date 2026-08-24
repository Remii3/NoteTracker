begin;

create or replace function public.get_chapter_summaries()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(summary.payload order by summary.position, summary.id), '[]'::jsonb)
  from (
    select
      chapter.id,
      chapter.position,
      jsonb_build_object(
        'id', chapter.id,
        'slug', chapter.slug,
        'title', chapter.title,
        'position', chapter.position,
        'topicsCount', count(topic.id),
        'completedTopicsCount', count(topic.id) filter (where topic.completed),
        'firstIncompleteTopicId', (
          array_agg(topic.id order by topic.position, topic.id)
            filter (where not topic.completed)
        )[1],
        'firstIncompleteTopicSlug', (
          array_agg(topic.slug order by topic.position, topic.id)
            filter (where not topic.completed)
        )[1]
      ) as payload
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
    where chapter.user_id = (select auth.uid())
    group by chapter.id
  ) as summary;
$$;

create or replace function public.get_topic_navigation(current_topic_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ordered_topics as (
    select
      topic.id as topic_id,
      topic.slug as topic_slug,
      topic.title as topic_title,
      chapter.id as chapter_id,
      chapter.slug as chapter_slug,
      chapter.title as chapter_title,
      row_number() over (
        order by chapter.position, chapter.id, topic.position, topic.id
      ) as topic_index,
      count(*) over () as total
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
      and chapter.user_id = (select auth.uid())
  ),
  current_topic as (
    select * from ordered_topics where topic_id = current_topic_id
  )
  select jsonb_build_object(
    'currentIndex', current_topic.topic_index - 1,
    'total', current_topic.total,
    'previous', (
      select jsonb_build_object(
        'chapterId', item.chapter_id,
        'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title,
        'topicId', item.topic_id,
        'topicSlug', item.topic_slug,
        'topicTitle', item.topic_title
      )
      from ordered_topics as item
      where item.topic_index = current_topic.topic_index - 1
    ),
    'next', (
      select jsonb_build_object(
        'chapterId', item.chapter_id,
        'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title,
        'topicId', item.topic_id,
        'topicSlug', item.topic_slug,
        'topicTitle', item.topic_title
      )
      from ordered_topics as item
      where item.topic_index = current_topic.topic_index + 1
    )
  )
  from current_topic;
$$;

revoke all on function public.get_chapter_summaries() from public;
revoke all on function public.get_topic_navigation(uuid) from public;
grant execute on function public.get_chapter_summaries() to authenticated;
grant execute on function public.get_topic_navigation(uuid) to authenticated;

commit;
