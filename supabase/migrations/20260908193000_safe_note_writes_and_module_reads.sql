-- Keep note writes atomic without placing rich-text JSON in a query string.
create function public.save_topic_content(
  target_chapter_id uuid,
  target_topic_id uuid,
  new_content jsonb,
  expected_content jsonb
) returns boolean
language plpgsql
set search_path to ''
as $$
begin
  update public.topics
  set content = new_content
  where id = target_topic_id
    and chapter_id = target_chapter_id
    and user_id = (select auth.uid())
    and trash_id is null
    and content = expected_content;
  return found;
end;
$$;

revoke all on function public.save_topic_content(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_topic_content(uuid, uuid, jsonb, jsonb) to authenticated;

-- Replace the old cross-module summary helpers with module-scoped versions.
drop function if exists public.get_chapter_summaries();
create function public.get_chapter_summaries(target_module_id uuid) returns jsonb
language sql stable
set search_path to ''
as $$
  select coalesce(jsonb_agg(summary.payload order by summary.position, summary.id), '[]'::jsonb)
  from (
    select chapter.id, chapter.position, jsonb_build_object(
      'id', chapter.id,
      'slug', chapter.slug,
      'title', chapter.title,
      'position', chapter.position,
      'topicsCount', count(topic.id),
      'completedTopicsCount', count(topic.id) filter (where topic.completed),
      'firstIncompleteTopicId', (array_agg(topic.id order by topic.position, topic.id) filter (where not topic.completed))[1],
      'firstIncompleteTopicSlug', (array_agg(topic.slug order by topic.position, topic.id) filter (where not topic.completed))[1]
    ) as payload
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
      and topic.trash_id is null
    where chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
    group by chapter.id
  ) as summary;
$$;

revoke all on function public.get_chapter_summaries(uuid) from public, anon;
grant execute on function public.get_chapter_summaries(uuid) to authenticated;

drop function if exists public.get_learning_summary();
create function public.get_learning_summary(target_module_id uuid) returns jsonb
language sql stable
set search_path to ''
as $$
  with owned_chapters as (
    select id, position
    from public.chapters
    where user_id = (select auth.uid())
      and module_id = target_module_id
      and trash_id is null
  ), owned_topics as (
    select topic.id, topic.chapter_id, topic.completed, topic.position
    from public.topics as topic
    join owned_chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid()) and topic.trash_id is null
  ), next_topic as (
    select topic.id, topic.chapter_id
    from owned_topics as topic
    join owned_chapters as chapter on chapter.id = topic.chapter_id
    where not topic.completed
    order by chapter.position, chapter.id, topic.position, topic.id
    limit 1
  )
  select jsonb_build_object(
    'totalChapters', (select count(*) from owned_chapters),
    'totalTopics', (select count(*) from owned_topics),
    'completedTopics', (select count(*) from owned_topics where completed),
    'completedChapters', (
      select count(*) from owned_chapters as chapter
      where exists (select 1 from owned_topics where chapter_id = chapter.id)
        and not exists (select 1 from owned_topics where chapter_id = chapter.id and not completed)
    ),
    'nextTopic', (
      select jsonb_build_object('chapterId', chapter_id, 'id', id) from next_topic
    )
  );
$$;

revoke all on function public.get_learning_summary(uuid) from public, anon;
grant execute on function public.get_learning_summary(uuid) to authenticated;

drop function if exists public.get_topic_navigation(uuid);
create function public.get_topic_navigation(
  target_module_id uuid,
  current_topic_id uuid
) returns jsonb
language sql stable
set search_path to ''
as $$
  with ordered_topics as (
    select topic.id as topic_id, topic.slug as topic_slug, topic.title as topic_title,
      chapter.id as chapter_id, chapter.slug as chapter_slug, chapter.title as chapter_title,
      row_number() over (order by chapter.position, chapter.id, topic.position, topic.id) as topic_index,
      count(*) over () as total
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
      and chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and topic.trash_id is null
      and chapter.trash_id is null
  ), current_topic as (
    select * from ordered_topics where topic_id = current_topic_id
  )
  select jsonb_build_object(
    'currentIndex', current_topic.topic_index - 1,
    'total', current_topic.total,
    'previous', (
      select jsonb_build_object(
        'chapterId', item.chapter_id, 'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title, 'topicId', item.topic_id,
        'topicSlug', item.topic_slug, 'topicTitle', item.topic_title
      ) from ordered_topics as item where item.topic_index = current_topic.topic_index - 1
    ),
    'next', (
      select jsonb_build_object(
        'chapterId', item.chapter_id, 'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title, 'topicId', item.topic_id,
        'topicSlug', item.topic_slug, 'topicTitle', item.topic_title
      ) from ordered_topics as item where item.topic_index = current_topic.topic_index + 1
    )
  ) from current_topic;
$$;

revoke all on function public.get_topic_navigation(uuid, uuid) from public, anon;
grant execute on function public.get_topic_navigation(uuid, uuid) to authenticated;

-- Remove legacy overloads that predate module ownership.
drop function if exists public.create_study_session(text, text, uuid, uuid, integer, integer);
drop function if exists public.get_question_bank_availability(uuid, uuid, boolean);
drop function if exists public.save_question(uuid, text, text, uuid, uuid, jsonb);
