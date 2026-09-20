create function public.get_exam_planning_scope(
  target_module_id uuid,
  timezone_name text default 'UTC'
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result_value jsonb;
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ) or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = timezone_name
  ) then
    raise exception 'Nieprawidłowy moduł lub strefa czasowa.';
  end if;

  with chapter_stats as (
    select chapter.id,
      chapter.title,
      chapter.position,
      count(topic.id)::integer as topic_count,
      count(topic.id) filter (where not topic.completed)::integer
        as unfinished_topic_count
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = chapter.user_id
      and topic.trash_id is null
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
    group by chapter.id, chapter.title, chapter.position
  ),
  unassigned_questions as (
    select question.id, review_state.due_at
    from public.questions as question
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.module_id = target_module_id
      and question.user_id = (select auth.uid())
      and question.topic_id is null
      and question.trash_id is null
  ),
  recent_durations as (
    select item.active_duration_seconds
    from public.study_session_items as item
    where item.user_id = (select auth.uid())
      and item.answered_at is not null
      and item.active_duration_seconds between 1 and 600
    order by item.answered_at desc
    limit 200
  ),
  ranked_durations as (
    select duration.active_duration_seconds,
      row_number() over (order by duration.active_duration_seconds)
        as sample_rank,
      count(*) over () as sample_count
    from recent_durations as duration
  ),
  pace as (
    select count(*)::integer as sample_size,
      coalesce(round(avg(ranked.active_duration_seconds) filter (
        where ranked.sample_count < 10
          or (
            ranked.sample_rank > floor(ranked.sample_count * 0.1)
            and ranked.sample_rank
              <= ranked.sample_count - floor(ranked.sample_count * 0.1)
          )
      )), 45)::integer as seconds_per_question
    from ranked_durations as ranked
  )
  select jsonb_build_object(
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', chapter.id,
        'title', chapter.title,
        'position', chapter.position,
        'topicCount', chapter.topic_count,
        'unfinishedTopicCount', chapter.unfinished_topic_count
      ) order by chapter.position, chapter.id)
      from chapter_stats as chapter
    ), '[]'::jsonb),
    'unassignedQuestionCount', (
      select count(*)::integer from unassigned_questions
    ),
    'unassignedDueReviewCount', (
      select count(*) filter (where question.due_at <= now())::integer
      from unassigned_questions as question
    ),
    'unassignedReviewDueDates', coalesce((
      select jsonb_agg(
        to_char(timezone(timezone_name, question.due_at), 'YYYY-MM-DD')
        order by question.due_at
      ) filter (where question.due_at is not null)
      from unassigned_questions as question
    ), '[]'::jsonb),
    'reviewSecondsPerQuestion', pace.seconds_per_question,
    'paceSampleSize', pace.sample_size
  ) into result_value
  from pace;

  return result_value;
end;
$$;

create function public.get_exam_planning_topics(
  target_module_id uuid,
  target_chapter_ids uuid[] default null,
  timezone_name text default 'UTC',
  search_query text default null,
  result_limit integer default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result_value jsonb;
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ) or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = timezone_name
  ) or (result_limit is not null and result_limit not between 1 and 100)
  or (search_query is not null and length(trim(search_query)) < 2)
  then
    raise exception 'Nieprawidłowe parametry zakresu egzaminu.';
  end if;

  with matching_topics as (
    select topic.id,
      topic.chapter_id,
      chapter.title as chapter_title,
      chapter.position as chapter_position,
      topic.title,
      topic.completed,
      topic.position,
      topic.content
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and topic.trash_id is null
      and (
        target_chapter_ids is null
        or topic.chapter_id = any(target_chapter_ids)
      )
      and (
        search_query is null
        or lower(topic.title) like '%' || lower(trim(search_query)) || '%'
        or lower(chapter.title) like '%' || lower(trim(search_query)) || '%'
      )
    order by chapter.position, topic.position, topic.id
    limit result_limit
  ),
  selected_topics as (
    select topic.id,
      topic.chapter_id,
      topic.chapter_title,
      topic.chapter_position,
      topic.title,
      topic.completed,
      topic.position,
      case
        when length(topic.content::text) < 800 then 1
        when length(topic.content::text) < 2500 then 2
        when length(topic.content::text) < 6000 then 4
        else 6
      end as workload_points
    from matching_topics as topic
  ),
  question_stats as (
    select question.topic_id,
      count(*)::integer as question_count,
      count(*) filter (where review_state.due_at <= now())::integer
        as due_review_count,
      coalesce(jsonb_agg(
        to_char(timezone(timezone_name, review_state.due_at), 'YYYY-MM-DD')
        order by review_state.due_at
      ) filter (where review_state.due_at is not null), '[]'::jsonb)
        as review_due_dates
    from public.questions as question
    join selected_topics as topic on topic.id = question.topic_id
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', topic.id,
    'chapterId', topic.chapter_id,
    'chapterTitle', topic.chapter_title,
    'title', topic.title,
    'completed', topic.completed,
    'workloadPoints', topic.workload_points,
    'workloadSource', 'automatic',
    'questionCount', coalesce(stats.question_count, 0),
    'dueReviewCount', coalesce(stats.due_review_count, 0),
    'reviewDueDates', coalesce(stats.review_due_dates, '[]'::jsonb)
  ) order by
    topic.chapter_position,
    topic.position,
    topic.id
  ), '[]'::jsonb) into result_value
  from selected_topics as topic
  left join question_stats as stats on stats.topic_id = topic.id;

  return result_value;
end;
$$;

revoke all on function public.get_exam_planning_scope(uuid, text)
  from public, anon;
grant execute on function public.get_exam_planning_scope(uuid, text)
  to authenticated;

revoke all on function public.get_exam_planning_topics(
  uuid, uuid[], text, text, integer
) from public, anon;
grant execute on function public.get_exam_planning_topics(
  uuid, uuid[], text, text, integer
) to authenticated;
