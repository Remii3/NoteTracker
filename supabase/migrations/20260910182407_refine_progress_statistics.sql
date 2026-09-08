drop trigger if exists sync_topic_completed_at on public.topics;
drop trigger if exists sync_topic_first_completed_at on public.topics;
drop function if exists public.sync_topic_completed_at();
drop function if exists public.sync_topic_first_completed_at();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topics'
      and column_name = 'completed_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topics'
      and column_name = 'first_completed_at'
  ) then
    alter table public.topics rename column completed_at to first_completed_at;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topics'
      and column_name = 'completed_at'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topics'
      and column_name = 'first_completed_at'
  ) then
    update public.topics
    set first_completed_at = case
      when first_completed_at is null then completed_at
      when completed_at is null then first_completed_at
      else least(first_completed_at, completed_at)
    end;
    alter table public.topics drop column completed_at;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topics'
      and column_name = 'first_completed_at'
  ) then
    alter table public.topics add column first_completed_at timestamptz;
  end if;
end;
$$;

create index if not exists topics_first_completion_idx
  on public.topics (user_id, first_completed_at)
  where trash_id is null and first_completed_at is not null;

create function public.sync_topic_first_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.first_completed_at = case when new.completed then now() else null end;
  elsif old.first_completed_at is not null then
    new.first_completed_at = old.first_completed_at;
  elsif new.completed then
    new.first_completed_at = now();
  else
    new.first_completed_at = null;
  end if;
  return new;
end;
$$;

create trigger sync_topic_first_completed_at
before insert or update of completed, first_completed_at on public.topics
for each row execute function public.sync_topic_first_completed_at();

revoke all on function public.sync_topic_first_completed_at()
  from public, anon, authenticated;

create or replace function public.get_progress_statistics(
  target_module_id uuid default null,
  range_days integer default 30,
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
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name
    )
    or (target_module_id is not null and not exists (
      select 1 from public.modules
      where id = target_module_id
        and user_id = (select auth.uid())
        and trash_id is null
    ))
  then
    raise exception 'Nieprawidłowe filtry statystyk postępu.';
  end if;

  with recursive
  params as (
    select timezone(timezone_name, now())::date as today,
      case
        when range_days = 0 then null
        else timezone(timezone_name, now())::date - (range_days - 1)
      end as cutoff
  ), owned_topics as (
    select topic.id, topic.chapter_id, chapter.module_id,
      topic.title, topic.position, topic.completed, topic.first_completed_at
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id and chapter.user_id = topic.user_id
    join public.modules as module
      on module.id = chapter.module_id and module.user_id = topic.user_id
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
      and chapter.trash_id is null
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
  ), chapter_progress as (
    select chapter.id, chapter.module_id, chapter.title, chapter.position,
      count(topic.id)::integer as topics,
      count(topic.id) filter (where topic.completed)::integer as completed_topics
    from public.chapters as chapter
    join public.modules as module
      on module.id = chapter.module_id and module.user_id = chapter.user_id
    left join owned_topics as topic on topic.chapter_id = chapter.id
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
    group by chapter.id, chapter.module_id, chapter.title, chapter.position
  ), module_progress as (
    select module.id, module.name, module.position,
      count(chapter.id)::integer as chapters,
      count(chapter.id) filter (
        where chapter.topics > 0 and chapter.completed_topics = chapter.topics
      )::integer as completed_chapters,
      coalesce(sum(chapter.topics), 0)::integer as topics,
      coalesce(sum(chapter.completed_topics), 0)::integer as completed_topics
    from public.modules as module
    left join chapter_progress as chapter on chapter.module_id = module.id
    where module.user_id = (select auth.uid())
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
    group by module.id, module.name, module.position
  ), completion_dates as (
    select distinct timezone(timezone_name, first_completed_at)::date as completed_date
    from owned_topics
    where first_completed_at is not null
  ), numbered_dates as (
    select completed_date,
      completed_date - (row_number() over (order by completed_date))::integer as island
    from completion_dates
  ), streaks as (
    select min(completed_date) as started_on,
      max(completed_date) as ended_on,
      count(*)::integer as days
    from numbered_dates group by island
  ), first_date as (
    select case
      when range_days > 0 then (select cutoff from params)
      else coalesce(
        (select min(completed_date) from completion_dates),
        (select today from params)
      )
    end as value
  ), calendar as (
    select generate_series(
      (select value from first_date),
      (select today from params),
      interval '1 day'
    )::date as day
  ), daily as (
    select calendar.day,
      count(topic.id)::integer as completed_topics
    from calendar
    left join owned_topics as topic
      on timezone(timezone_name, topic.first_completed_at)::date = calendar.day
    group by calendar.day
  ), weekly_totals as (
    select date_trunc(
        'week', timezone(timezone_name, first_completed_at)
      )::date as week_started_on,
      count(*)::integer as completed_topics
    from owned_topics
    where first_completed_at is not null
    group by week_started_on
  ), weekly as (
    select
      coalesce((
        select completed_topics from weekly_totals, params
        where week_started_on = date_trunc('week', params.today)::date
      ), 0)::integer as completed_topics,
      coalesce((select max(completed_topics) from weekly_totals), 0)::integer
        as best_completed_topics
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'totalModules', count(*),
      'completedModules', count(*) filter (
        where topics > 0 and completed_topics = topics
      ),
      'totalChapters', coalesce(sum(chapters), 0),
      'completedChapters', coalesce(sum(completed_chapters), 0),
      'totalTopics', coalesce(sum(topics), 0),
      'completedTopics', coalesce(sum(completed_topics), 0),
      'remainingTopics', coalesce(sum(topics - completed_topics), 0),
      'currentStreak', coalesce((
        select days from streaks, params
        where ended_on = (select max(completed_date) from completion_dates)
          and ended_on >= params.today - 1
      ), 0),
      'longestStreak', coalesce((select max(days) from streaks), 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'completedTopics', completed_topics
    ) order by day) from daily), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name,
      'chapters', chapters, 'completedChapters', completed_chapters,
      'topics', topics, 'completedTopics', completed_topics
    ) order by position) from module_progress), '[]'::jsonb),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'moduleId', module_id, 'title', title,
      'topics', topics, 'completedTopics', completed_topics
    ) order by position) from chapter_progress), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'chapterId', chapter_id, 'title', title,
      'completed', completed, 'firstCompletedAt', first_completed_at
    ) order by position) from owned_topics), '[]'::jsonb),
    'weeklyGoal', jsonb_build_object(
      'topics', coalesce((
        select weekly_topics from public.study_goals
        where user_id = (select auth.uid())
      ), 5),
      'completedTopics', (select completed_topics from weekly),
      'bestCompletedTopics', (select best_completed_topics from weekly)
    )
  ) into result
  from module_progress;

  return result;
end;
$$;

revoke all on function public.get_progress_statistics(uuid, integer, text)
  from public, anon;
grant execute on function public.get_progress_statistics(uuid, integer, text)
  to authenticated;

create function public.get_module_summaries(target_module_id uuid default null)
returns table (
  id uuid,
  name text,
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
  select module.id, module.name, module.position as module_position,
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
  group by module.id, module.name, module.position
  order by module.position, module.id;
$$;

revoke all on function public.get_module_summaries(uuid) from public, anon;
grant execute on function public.get_module_summaries(uuid) to authenticated;
