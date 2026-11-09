create or replace function public.get_today_overview(
  timezone_name text default 'UTC'
) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name
    )
  then
    raise exception 'Nieprawidłowe parametry ekranu Dzisiaj.';
  end if;

  with recursive
  params as (
    select timezone(timezone_name, now())::date as today
  ),
  plan_progress as (
    select plan.id, plan.name, plan.module_id, module.name as module_name,
      module.slug as module_slug, plan.exam_date, plan.status,
      plan.study_weekdays, timezone(timezone_name, plan.created_at)::date as created_on,
      count(scope.topic_id)::integer as topics_count,
      count(scope.topic_id) filter (where topic.completed)::integer
        as completed_topics_count,
      round(count(scope.topic_id) * least(1, coalesce(
        (select count(*)::numeric
          from generate_series(
            timezone(timezone_name, plan.created_at)::date,
            least(params.today, plan.exam_date), interval '1 day'
          ) as elapsed(day)
          where extract(dow from elapsed.day)::smallint = any(plan.study_weekdays)
        ) / nullif((select count(*)::numeric
          from generate_series(
            timezone(timezone_name, plan.created_at)::date,
            plan.exam_date, interval '1 day'
          ) as available(day)
          where extract(dow from available.day)::smallint = any(plan.study_weekdays)
        ), 0), 1)))::integer as expected_topics_count
    from public.exam_plans as plan
    join public.modules as module on module.id = plan.module_id
      and module.user_id = plan.user_id and module.trash_id is null
    cross join params
    left join public.exam_plan_topics as scope on scope.exam_plan_id = plan.id
      and scope.user_id = plan.user_id
    left join public.topics as topic on topic.id = scope.topic_id
      and topic.user_id = plan.user_id and topic.trash_id is null
    where plan.user_id = (select auth.uid())
    group by plan.id, module.name, module.slug, params.today
  ),
  finished_preparations as (
    select * from plan_progress, params
    where status = 'completed'
      or (status <> 'archived' and exam_date < params.today)
  ),
  activity_dates as (
    select distinct timezone(timezone_name, topic.first_completed_at)::date as day
    from public.topics as topic
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null and topic.first_completed_at is not null
    union
    select distinct timezone(timezone_name, item.answered_at)::date
    from public.study_session_items as item
    join public.study_sessions as session on session.id = item.session_id
      and session.user_id = item.user_id
    where item.user_id = (select auth.uid()) and item.answered_at is not null
      and session.trash_id is null
  ),
  calendar as (
    select generate_series(
      coalesce(
        (select min(created_on) from plan_progress where status <> 'archived'),
        (select min(day) from activity_dates),
        (select today from params)
      ),
      (select today from params), interval '1 day'
    )::date as day
  ),
  planned_dates as (
    select calendar.day
    from calendar
    where exists (
      select 1 from plan_progress as plan
      where plan.status <> 'archived'
        and calendar.day between plan.created_on and plan.exam_date
        and extract(dow from calendar.day)::smallint = any(plan.study_weekdays)
    )
  ),
  last_missed as (
    select max(planned.day) as day
    from planned_dates as planned cross join params
    where planned.day < params.today
      and not exists (select 1 from activity_dates where activity_dates.day = planned.day)
  ),
  active_session as (
    select session.id, session.module_id, module.slug as module_slug,
      count(item.id)::integer as total,
      count(item.id) filter (where item.result is not null)::integer as answered
    from public.study_sessions as session
    join public.modules as module on module.id = session.module_id
      and module.user_id = session.user_id and module.trash_id is null
    join public.study_session_items as item on item.session_id = session.id
      and item.user_id = session.user_id
    cross join params
    where session.user_id = (select auth.uid())
      and session.trash_id is null and session.status = 'in_progress'
      and session.configuration->>'scope' = 'fsrs_due'
      and timezone(timezone_name, session.started_at)::date = params.today
    group by session.id, module.slug
    order by session.started_at desc
    limit 1
  )
  select jsonb_build_object(
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'moduleId', module_id,
        'moduleName', module_name, 'moduleSlug', module_slug,
        'examDate', exam_date, 'topicsCount', topics_count,
        'completedTopicsCount', completed_topics_count,
        'expectedTopicsCount', expected_topics_count
      ) order by exam_date, name, id)
      from plan_progress, params
      where status = 'active' and exam_date >= params.today
    ), '[]'::jsonb),
    'preparationAverage', case
      when (select count(*) from finished_preparations) = 0 then null
      else jsonb_build_object(
        'percent', (select round(avg(case when topics_count = 0 then 100
          else completed_topics_count * 100.0 / topics_count end))::integer
          from finished_preparations),
        'plansCount', (select count(*)::integer from finished_preparations)
      ) end,
    'streak', (
      select count(*)::integer from planned_dates, last_missed
      where (last_missed.day is null or planned_dates.day > last_missed.day)
        and exists (
          select 1 from activity_dates where activity_dates.day = planned_dates.day
        )
    ),
    'isRestDay', case when exists (
      select 1 from plan_progress, params
      where status = 'active' and exam_date >= params.today
    ) then not exists (
      select 1 from plan_progress, params
      where status = 'active' and exam_date >= params.today
        and extract(dow from params.today)::smallint = any(study_weekdays)
    ) else false end,
    'capacity', jsonb_build_object(
      'isOverloaded', exists (
        select 1
        from public.exam_plan_daily_targets as target
        join public.exam_plans as plan on plan.id = target.exam_plan_id
          and plan.user_id = target.user_id
        cross join params
        where target.user_id = (select auth.uid())
          and target.target_date = params.today
          and target.is_overloaded
          and plan.status = 'active' and plan.exam_date >= params.today
      ),
      'dailyLimitMinutes', (
        select sum(plan.daily_time_limit_minutes)::integer
        from public.exam_plans as plan cross join params
        where plan.user_id = (select auth.uid())
          and plan.status = 'active' and plan.exam_date >= params.today
          and extract(dow from params.today)::smallint = any(plan.study_weekdays)
      )
    ),
    'activeSession', (select jsonb_build_object(
      'id', id, 'moduleId', module_id, 'moduleSlug', module_slug,
      'answered', answered, 'total', total
    ) from active_session)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_today_overview(text) from public;

grant execute on function public.get_today_overview(text) to authenticated;

grant execute on function public.get_today_overview(text) to service_role;
