create or replace function public.get_exam_planning_scope(
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

  with module_stats as (
    select count(distinct chapter.id)::integer as chapter_count,
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
  unassigned_due_date_counts as (
    select to_char(
        timezone(timezone_name, question.due_at),
        'YYYY-MM-DD'
      ) as due_date,
      count(*)::integer as due_count
    from unassigned_questions as question
    where question.due_at is not null
    group by 1
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
    'chapterCount', stats.chapter_count,
    'topicCount', stats.topic_count,
    'unfinishedTopicCount', stats.unfinished_topic_count,
    'unassignedQuestionCount', (
      select count(*)::integer from unassigned_questions
    ),
    'unassignedDueReviewCount', (
      select count(*) filter (where question.due_at <= now())::integer
      from unassigned_questions as question
    ),
    'unassignedReviewDueDateCounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', due.due_date,
        'count', due.due_count
      ) order by due.due_date)
      from unassigned_due_date_counts as due
    ), '[]'::jsonb),
    'reviewSecondsPerQuestion', pace.seconds_per_question,
    'paceSampleSize', pace.sample_size
  ) into result_value
  from pace
  cross join module_stats as stats;

  return result_value;
end;
$$;

create or replace function public.get_exam_planning_topics(
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
        as due_review_count
    from public.questions as question
    join selected_topics as topic on topic.id = question.topic_id
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id
  ),
  review_due_date_counts as (
    select question.topic_id,
      to_char(
        timezone(timezone_name, review_state.due_at),
        'YYYY-MM-DD'
      ) as due_date,
      count(*)::integer as due_count
    from public.questions as question
    join selected_topics as topic on topic.id = question.topic_id
    join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id, 2
  ),
  review_due_stats as (
    select due.topic_id,
      jsonb_agg(jsonb_build_object(
        'date', due.due_date,
        'count', due.due_count
      ) order by due.due_date) as review_due_date_counts
    from review_due_date_counts as due
    group by due.topic_id
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
    'reviewDueDateCounts', coalesce(
      due.review_due_date_counts,
      '[]'::jsonb
    )
  ) order by
    topic.chapter_position,
    topic.position,
    topic.id
  ), '[]'::jsonb) into result_value
  from selected_topics as topic
  left join question_stats as stats on stats.topic_id = topic.id
  left join review_due_stats as due on due.topic_id = topic.id;

  return result_value;
end;
$$;

create or replace function public.get_exam_planning_chapters(
  target_module_id uuid,
  search_query text default null,
  after_position bigint default null,
  after_id uuid default null,
  result_limit integer default 50
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
  ) or result_limit is null
  or result_limit not between 1 and 100
  or (search_query is not null and length(trim(search_query)) < 2)
  or ((after_position is null) <> (after_id is null))
  then
    raise exception 'Nieprawidłowe parametry listy rozdziałów.';
  end if;

  with matching_chapters as (
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
      and (
        search_query is null
        or lower(chapter.title) like '%' || lower(trim(search_query)) || '%'
        or exists (
          select 1
          from public.topics as matching_topic
          where matching_topic.chapter_id = chapter.id
            and matching_topic.user_id = chapter.user_id
            and matching_topic.trash_id is null
            and lower(matching_topic.title)
              like '%' || lower(trim(search_query)) || '%'
        )
      )
    group by chapter.id, chapter.title, chapter.position
  ),
  counted_chapters as (
    select chapter.*,
      count(*) over ()::integer as total_count
    from matching_chapters as chapter
  ),
  page as (
    select chapter.*
    from counted_chapters as chapter
    where after_position is null
      or (chapter.position, chapter.id) > (after_position, after_id)
    order by chapter.position, chapter.id
    limit result_limit + 1
  ),
  visible_page as (
    select chapter.*
    from page as chapter
    order by chapter.position, chapter.id
    limit result_limit
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
      from visible_page as chapter
    ), '[]'::jsonb),
    'totalCount', coalesce((
      select max(chapter.total_count) from counted_chapters as chapter
    ), 0),
    'hasMore', (select count(*) > result_limit from page),
    'nextCursor', case
      when (select count(*) > result_limit from page) then (
        select jsonb_build_object(
          'position', chapter.position,
          'id', chapter.id
        )
        from visible_page as chapter
        order by chapter.position desc, chapter.id desc
        limit 1
      )
      else null
    end
  ) into result_value;

  return result_value;
end;
$$;

create function public.get_exam_planning_topics_page(
  target_module_id uuid,
  target_chapter_ids uuid[] default null,
  timezone_name text default 'UTC',
  search_query text default null,
  after_chapter_position bigint default null,
  after_topic_position bigint default null,
  after_id uuid default null,
  result_limit integer default 100
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
  ) or result_limit is null
  or result_limit not between 1 and 100
  or (search_query is not null and length(trim(search_query)) < 2)
  or num_nonnulls(
    after_chapter_position,
    after_topic_position,
    after_id
  ) not in (0, 3)
  then
    raise exception 'Nieprawidłowe parametry listy tematów.';
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
      and (
        after_chapter_position is null
        or (chapter.position, topic.position, topic.id) > (
          after_chapter_position,
          after_topic_position,
          after_id
        )
      )
    order by chapter.position, topic.position, topic.id
    limit result_limit + 1
  ),
  visible_topics as (
    select topic.*,
      case
        when length(topic.content::text) < 800 then 1
        when length(topic.content::text) < 2500 then 2
        when length(topic.content::text) < 6000 then 4
        else 6
      end as workload_points
    from matching_topics as topic
    order by topic.chapter_position, topic.position, topic.id
    limit result_limit
  ),
  question_stats as (
    select question.topic_id,
      count(*)::integer as question_count,
      count(*) filter (where review_state.due_at <= now())::integer
        as due_review_count
    from public.questions as question
    join visible_topics as topic on topic.id = question.topic_id
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id
  ),
  review_due_date_counts as (
    select question.topic_id,
      to_char(
        timezone(timezone_name, review_state.due_at),
        'YYYY-MM-DD'
      ) as due_date,
      count(*)::integer as due_count
    from public.questions as question
    join visible_topics as topic on topic.id = question.topic_id
    join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id, 2
  ),
  review_due_stats as (
    select due.topic_id,
      jsonb_agg(jsonb_build_object(
        'date', due.due_date,
        'count', due.due_count
      ) order by due.due_date) as review_due_date_counts
    from review_due_date_counts as due
    group by due.topic_id
  )
  select jsonb_build_object(
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', topic.id,
        'chapterId', topic.chapter_id,
        'chapterTitle', topic.chapter_title,
        'title', topic.title,
        'completed', topic.completed,
        'workloadPoints', topic.workload_points,
        'workloadSource', 'automatic',
        'questionCount', coalesce(stats.question_count, 0),
        'dueReviewCount', coalesce(stats.due_review_count, 0),
        'reviewDueDateCounts', coalesce(
          due.review_due_date_counts,
          '[]'::jsonb
        )
      ) order by topic.chapter_position, topic.position, topic.id)
      from visible_topics as topic
      left join question_stats as stats on stats.topic_id = topic.id
      left join review_due_stats as due on due.topic_id = topic.id
    ), '[]'::jsonb),
    'hasMore', (select count(*) > result_limit from matching_topics),
    'nextCursor', case
      when (select count(*) > result_limit from matching_topics) then (
        select jsonb_build_object(
          'chapterPosition', topic.chapter_position,
          'topicPosition', topic.position,
          'id', topic.id
        )
        from visible_topics as topic
        order by topic.chapter_position desc, topic.position desc, topic.id desc
        limit 1
      )
      else null
    end
  ) into result_value;

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

revoke all on function public.get_exam_planning_chapters(
  uuid, text, bigint, uuid, integer
) from public, anon;
grant execute on function public.get_exam_planning_chapters(
  uuid, text, bigint, uuid, integer
) to authenticated;

revoke all on function public.get_exam_planning_topics_page(
  uuid, uuid[], text, text, bigint, bigint, uuid, integer
) from public, anon;
grant execute on function public.get_exam_planning_topics_page(
  uuid, uuid[], text, text, bigint, bigint, uuid, integer
) to authenticated;
