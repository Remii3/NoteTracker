alter table public.study_session_items
  add column chapter_id_snapshot uuid,
  add column topic_id_snapshot uuid,
  add column chapter_title_snapshot text,
  add column topic_title_snapshot text,
  add column active_duration_seconds integer not null default 0;

alter table public.study_session_items
  add constraint study_session_items_active_duration_check
  check (active_duration_seconds between 0 and 86400);

update public.study_session_items as item
set chapter_id_snapshot = question.chapter_id,
    topic_id_snapshot = question.topic_id,
    chapter_title_snapshot = chapter.title,
    topic_title_snapshot = topic.title
from public.questions as question
left join public.chapters as chapter on chapter.id = question.chapter_id
left join public.topics as topic on topic.id = question.topic_id
where question.id = item.question_id;

create index study_session_items_user_answered_idx
  on public.study_session_items (user_id, answered_at)
  where answered_at is not null;

create index study_session_items_session_answered_idx
  on public.study_session_items (session_id, answered_at)
  where answered_at is not null;

create table public.study_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_minutes integer not null default 150,
  updated_at timestamptz not null default now(),
  constraint study_goals_weekly_minutes_check
    check (weekly_minutes between 15 and 10080)
);

alter table public.study_goals enable row level security;
revoke all on table public.study_goals from anon, authenticated;
grant select, insert, update on table public.study_goals to authenticated;

create policy "Users read own study goal"
on public.study_goals for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users create own study goal"
on public.study_goals for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update own study goal"
on public.study_goals for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop function if exists public.create_study_session(uuid, text, text, uuid, uuid, integer, integer);
create function public.create_study_session(
  target_module_id uuid,
  study_mode text,
  scope_mode text,
  selected_chapter_id uuid default null,
  selected_topic_id uuid default null,
  random_chapter_count integer default 3,
  requested_question_count integer default 20
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare created_id uuid; inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
    or not exists (
      select 1 from public.modules
      where id = target_module_id and user_id = (select auth.uid()) and trash_id is null
    )
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, study_mode,
    jsonb_build_object('scope', scope_mode, 'chapterId', selected_chapter_id, 'topicId', selected_topic_id))
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
      and exists (
        select 1 from public.questions as question
        join public.question_options as option on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id
          and question.user_id = (select auth.uid())
          and question.module_id = target_module_id
          and question.trash_id is null
        group by question.id
        having study_mode = 'flashcards' or count(option.id) >= 2
      )
    order by random() limit greatest(1, random_chapter_count)
  ), candidates as (
    select question.id, question.content, question.explanation,
      question.chapter_id, question.topic_id,
      chapter.title as chapter_title, topic.title as topic_title,
      jsonb_agg(jsonb_build_object(
        'id', option.id, 'content', option.content, 'isCorrect', option.is_correct
      ) order by option.position) as option_data
    from public.questions as question
    join public.question_options as option on option.question_id = question.id
      and option.user_id = (select auth.uid())
    left join public.chapters as chapter on chapter.id = question.chapter_id
    left join public.topics as topic on topic.id = question.topic_id
    where question.user_id = (select auth.uid())
      and question.module_id = target_module_id
      and question.trash_id is null
      and (
        scope_mode = 'all'
        or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
        or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
        or (scope_mode = 'unassigned' and question.chapter_id is null and question.topic_id is null)
        or (scope_mode = 'random_chapters' and question.chapter_id in (select id from random_chapters))
      )
    group by question.id, chapter.title, topic.title
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random() limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items (
    user_id, session_id, question_id, position, question_snapshot,
    options_snapshot, explanation_snapshot, chapter_id_snapshot,
    topic_id_snapshot, chapter_title_snapshot, topic_title_snapshot
  )
  select (select auth.uid()), created_id, id, row_number() over ()::integer,
    content, option_data, explanation, chapter_id, topic_id, chapter_title, topic_title
  from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;
  return created_id;
end;
$$;

revoke all on function public.create_study_session(uuid, text, text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.create_study_session(uuid, text, text, uuid, uuid, integer, integer) to authenticated;

create function public.get_study_statistics(
  target_module_id uuid default null,
  range_days integer default 30,
  study_mode text default null,
  timezone_name text default 'UTC'
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  if range_days not in (0, 7, 30, 90)
    or (study_mode is not null and study_mode not in ('flashcards', 'test'))
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_name)
    or (target_module_id is not null and not exists (
      select 1 from public.modules
      where id = target_module_id and user_id = (select auth.uid()) and trash_id is null
    ))
  then raise exception 'Nieprawidłowe filtry statystyk.'; end if;

  with recursive
  params as (
    select timezone(timezone_name, now())::date as today,
      case when range_days = 0 then null
        else timezone(timezone_name, now())::date - (range_days - 1) end as cutoff
  ), eligible_sessions as (
    select session.*,
      timezone(timezone_name, session.started_at)::date as study_date
    from public.study_sessions as session, params
    where session.user_id = (select auth.uid())
      and session.trash_id is null
      and (target_module_id is null or session.module_id = target_module_id)
      and (study_mode is null or session.mode = study_mode)
  ), item_rows as (
    select item.*, session.module_id, session.mode, session.status,
      coalesce(timezone(timezone_name, item.answered_at)::date, session.study_date) as study_date,
      (item.result in ('correct', 'remembered')) as successful
    from public.study_session_items as item
    join eligible_sessions as session on session.id = item.session_id
    where item.result is not null
  ), all_activity_dates as (
    select distinct study_date from item_rows where study_date is not null
  ), numbered_dates as (
    select study_date,
      study_date - (row_number() over (order by study_date))::integer as island
    from all_activity_dates
  ), streaks as (
    select min(study_date) as started_on, max(study_date) as ended_on, count(*)::integer as days
    from numbered_dates group by island
  ), session_metrics as (
    select session.id, session.module_id, session.mode, session.status,
      session.started_at, session.completed_at, session.configuration, session.study_date,
      count(item.id) filter (where item.result is not null)::integer as answers,
      count(item.id) filter (where item.successful)::integer as successful,
      case
        when coalesce(sum(item.active_duration_seconds), 0) > 0
          then sum(item.active_duration_seconds)::integer
        when session.completed_at is not null
          then least(14400, greatest(0, extract(epoch from session.completed_at - session.started_at)::integer))
        else 0
      end as duration_seconds
    from eligible_sessions as session
    left join item_rows as item on item.session_id = session.id
    group by session.id, session.module_id, session.mode, session.status,
      session.started_at, session.completed_at, session.configuration, session.study_date
  ), weekly_session_metrics as (
    select session.id,
      timezone(timezone_name, session.started_at)::date as study_date,
      case
        when coalesce(sum(item.active_duration_seconds), 0) > 0
          then sum(item.active_duration_seconds)::integer
        when session.completed_at is not null
          then least(14400, greatest(0, extract(epoch from session.completed_at - session.started_at)::integer))
        else 0
      end as duration_seconds
    from public.study_sessions as session
    left join public.study_session_items as item
      on item.session_id = session.id and item.result is not null
    where session.user_id = (select auth.uid()) and session.trash_id is null
    group by session.id, session.started_at, session.completed_at
  ), bounded_sessions as (
    select session.* from session_metrics as session, params
    where params.cutoff is null or session.study_date >= params.cutoff
  ), previous_sessions as (
    select session.* from session_metrics as session, params
    where params.cutoff is not null
      and session.study_date < params.cutoff
      and session.study_date >= params.cutoff - range_days
  ), bounded_items as (
    select item.* from item_rows as item, params
    where params.cutoff is null or item.study_date >= params.cutoff
  ), first_date as (
    select case
      when range_days > 0 then (select cutoff from params)
      else coalesce((select min(study_date) from all_activity_dates), (select today from params))
    end as value
  ), calendar as (
    select generate_series(
      (select value from first_date), (select today from params), interval '1 day'
    )::date as day
  ), daily as (
    select calendar.day,
      count(distinct item.session_id)::integer as sessions,
      count(item.id)::integer as answers,
      count(item.id) filter (where item.successful)::integer as successful,
      coalesce((select sum(duration_seconds) from bounded_sessions where study_date = calendar.day), 0)::integer as duration_seconds
    from calendar
    left join bounded_items as item on item.study_date = calendar.day
    group by calendar.day
  ), areas as (
    select coalesce(item.chapter_id_snapshot::text, 'unassigned') as chapter_id,
      coalesce(item.chapter_title_snapshot, 'Nieprzypisane') as chapter_title,
      item.topic_id_snapshot::text as topic_id,
      item.topic_title_snapshot as topic_title,
      count(*)::integer as answers,
      count(*) filter (where item.successful)::integer as successful,
      max(item.answered_at) as last_studied_at
    from bounded_items as item
    group by item.chapter_id_snapshot, item.chapter_title_snapshot,
      item.topic_id_snapshot, item.topic_title_snapshot
  ), module_metrics as (
    select module.id, module.name,
      count(item.id)::integer as answers,
      count(item.id) filter (where item.successful)::integer as successful,
      max(item.answered_at) as last_studied_at
    from public.modules as module
    left join bounded_items as item on item.module_id = module.id
    where module.user_id = (select auth.uid()) and module.trash_id is null
    group by module.id, module.name, module.position
    order by module.position
  ), current_summary as (
    select count(*) filter (where status = 'completed')::integer as completed_sessions,
      coalesce(sum(answers), 0)::integer as answers,
      coalesce(sum(successful), 0)::integer as successful,
      coalesce(sum(duration_seconds), 0)::integer as duration_seconds
    from bounded_sessions
  ), previous_summary as (
    select coalesce(sum(answers), 0)::integer as answers,
      coalesce(sum(successful), 0)::integer as successful
    from previous_sessions
  ), week_progress as (
    select coalesce(sum(duration_seconds), 0)::integer as duration_seconds
    from weekly_session_metrics, params
    where study_date >= date_trunc('week', params.today)::date
      and study_date <= params.today
  ), busiest_day as (
    select day, answers from daily order by answers desc, day desc limit 1
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'completedSessions', current_summary.completed_sessions,
      'answers', current_summary.answers,
      'successful', current_summary.successful,
      'accuracy', case when current_summary.answers = 0 then 0 else round(current_summary.successful * 100.0 / current_summary.answers)::integer end,
      'previousAccuracy', case when previous_summary.answers = 0 then null else round(previous_summary.successful * 100.0 / previous_summary.answers)::integer end,
      'durationSeconds', current_summary.duration_seconds,
      'activeDays', (select count(*) from daily where answers > 0),
      'currentStreak', coalesce((select days from streaks, params where ended_on = (select max(study_date) from all_activity_dates) and ended_on >= params.today - 1), 0),
      'longestStreak', coalesce((select max(days) from streaks), 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'sessions', sessions, 'answers', answers,
      'successful', successful, 'durationSeconds', duration_seconds
    ) order by day) from daily), '[]'::jsonb),
    'sessionTrend', coalesce((select jsonb_agg(entry order by started_at) from (
      select jsonb_build_object(
        'id', id, 'date', started_at, 'mode', mode, 'answers', answers,
        'accuracy', case when answers = 0 then 0 else round(successful * 100.0 / answers)::integer end
      ) as entry, started_at from bounded_sessions
      where answers > 0 order by started_at desc limit 50
    ) trend), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
      'chapterId', chapter_id, 'chapterTitle', chapter_title,
      'topicId', topic_id, 'topicTitle', topic_title, 'answers', answers,
      'accuracy', round(successful * 100.0 / answers)::integer,
      'lastStudiedAt', last_studied_at
    ) order by (successful * 1.0 / answers), answers desc) from areas), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'answers', answers,
      'accuracy', case when answers = 0 then 0 else round(successful * 100.0 / answers)::integer end,
      'lastStudiedAt', last_studied_at
    )) from module_metrics), '[]'::jsonb),
    'recentSessions', coalesce((select jsonb_agg(entry order by started_at desc) from (
      select jsonb_build_object(
        'id', recent_session.id,
        'moduleId', recent_session.module_id,
        'mode', recent_session.mode,
        'status', recent_session.status,
        'moduleName', module.name,
        'startedAt', recent_session.started_at,
        'completedAt', recent_session.completed_at,
        'answers', recent_session.answers,
        'accuracy', case when recent_session.answers = 0 then 0 else round(recent_session.successful * 100.0 / recent_session.answers)::integer end,
        'durationSeconds', recent_session.duration_seconds
      ) as entry, recent_session.started_at
      from bounded_sessions as recent_session
      join public.modules as module on module.id = recent_session.module_id
      order by recent_session.started_at desc limit 5
    ) recent), '[]'::jsonb),
    'records', jsonb_build_object(
      'bestAccuracy', coalesce((select max(round(successful * 100.0 / answers)::integer) from bounded_sessions where answers >= 5), 0),
      'mostAnswersInDay', coalesce((select answers from busiest_day), 0),
      'mostActiveDate', (select day from busiest_day)
    ),
    'weeklyGoal', jsonb_build_object(
      'minutes', coalesce((select weekly_minutes from public.study_goals where user_id = (select auth.uid())), 150),
      'completedSeconds', (select duration_seconds from week_progress)
    )
  ) into result
  from current_summary cross join previous_summary;

  return result;
end;
$$;

revoke all on function public.get_study_statistics(uuid, integer, text, text) from public, anon;
grant execute on function public.get_study_statistics(uuid, integer, text, text) to authenticated;
