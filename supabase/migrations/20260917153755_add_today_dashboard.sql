alter table public.modules
  add column exam_date date;

comment on column public.modules.exam_date is
  'Optional date of the exam associated with this module.';

create table public.study_task_deferrals (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null,
  task_id uuid not null,
  deferred_until date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_type, task_id),
  constraint study_task_deferrals_task_type_check
    check (task_type in ('question', 'topic'))
);

comment on table public.study_task_deferrals is
  'Per-user deferrals for automatically generated Today tasks.';

alter table public.study_task_deferrals enable row level security;
revoke all on table public.study_task_deferrals from anon, authenticated;
grant select, insert, update, delete on table public.study_task_deferrals
  to authenticated;

create policy "Users read own task deferrals"
on public.study_task_deferrals for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users create own task deferrals"
on public.study_task_deferrals for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update own task deferrals"
on public.study_task_deferrals for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users delete own task deferrals"
on public.study_task_deferrals for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create function public.get_today_dashboard(timezone_name text default 'UTC')
returns jsonb
language plpgsql
stable
security invoker
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

  with
  params as (
    select timezone(timezone_name, now())::date as today
  ),
  module_progress as (
    select module.id, module.name, module.slug, module.exam_date,
      module.is_pinned, module.position,
      count(topic.id)::integer as topics_count,
      count(topic.id) filter (where topic.completed)::integer
        as completed_topics_count
    from public.modules as module
    left join public.chapters as chapter
      on chapter.module_id = module.id
      and chapter.user_id = module.user_id
      and chapter.trash_id is null
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = module.user_id
      and topic.trash_id is null
    where module.user_id = (select auth.uid())
      and module.trash_id is null
    group by module.id
  ),
  latest_answers as (
    select distinct on (item.question_id)
      item.question_id, item.result, item.answered_at
    from public.study_session_items as item
    where item.user_id = (select auth.uid())
      and item.question_id is not null
      and item.result is not null
    order by item.question_id, item.answered_at desc nulls last, item.id desc
  ),
  due_question_rows as (
    select question.id, question.content, module.id as module_id,
      module.name as module_name, module.slug as module_slug,
      chapter.title as chapter_title, topic.title as topic_title,
      case
        when answer.question_id is null or answer.answered_at is null
          then (select today from params)
        when answer.result in ('incorrect', 'forgotten')
          then timezone(timezone_name, answer.answered_at)::date + 1
        else timezone(timezone_name, answer.answered_at)::date + 7
      end as due_on,
      answer.answered_at
    from public.questions as question
    join public.modules as module
      on module.id = question.module_id
      and module.user_id = question.user_id
      and module.trash_id is null
    left join public.chapters as chapter
      on chapter.id = question.chapter_id and chapter.trash_id is null
    left join public.topics as topic
      on topic.id = question.topic_id and topic.trash_id is null
    left join latest_answers as answer on answer.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
      and exists (
        select 1 from public.question_options as option
        where option.question_id = question.id
          and option.user_id = (select auth.uid())
      )
      and not exists (
        select 1 from public.study_task_deferrals as deferral, params
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'question'
          and deferral.task_id = question.id
          and deferral.deferred_until > params.today
      )
  ),
  due_questions as (
    select * from due_question_rows
    where due_on <= (select today from params)
    order by due_on, answered_at nulls first, id
    limit 8
  ),
  recommended_topics as (
    select topic.id, topic.title, topic.slug, chapter.title as chapter_title,
      chapter.slug as chapter_slug,
      module.id as module_id, module.name as module_name,
      module.slug as module_slug
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
      and chapter.trash_id is null
    join public.modules as module
      on module.id = chapter.module_id
      and module.user_id = topic.user_id
      and module.trash_id is null
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
      and not topic.completed
      and not exists (
        select 1 from public.study_task_deferrals as deferral, params
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'topic'
          and deferral.task_id = topic.id
          and deferral.deferred_until > params.today
      )
    order by module.exam_date asc nulls last, module.is_pinned desc,
      module.position, chapter.position, topic.position, topic.id
    limit 5
  ),
  nearest_exam as (
    select * from module_progress, params
    where exam_date >= params.today
    order by exam_date, position, id
    limit 1
  ),
  weekly_progress as (
    select count(*)::integer as completed
    from public.topics as topic, params
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
      and topic.completed
      and timezone(timezone_name, topic.first_completed_at)::date
        >= date_trunc('week', params.today)::date
      and timezone(timezone_name, topic.first_completed_at)::date <= params.today
  ),
  recent_summary as (
    select session.id, session.completed_at,
      count(item.id) filter (where item.result is not null)::integer as answers,
      count(item.id) filter (
        where item.result in ('correct', 'remembered')
      )::integer as successful,
      coalesce(sum(item.active_duration_seconds), 0)::integer
        as duration_seconds
    from public.study_sessions as session
    join public.study_session_items as item on item.session_id = session.id
    cross join params
    where session.user_id = (select auth.uid())
      and session.trash_id is null
      and session.status = 'completed'
      and timezone(timezone_name, session.completed_at)::date = params.today
    group by session.id
    order by session.completed_at desc
    limit 1
  ),
  session_target as (
    select module_id, module_name, module_slug from due_questions
    group by module_id, module_name, module_slug
    order by count(*) desc, module_name
    limit 1
  )
  select jsonb_build_object(
    'date', (select today from params),
    'dueQuestions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'content', content, 'moduleId', module_id,
      'moduleName', module_name, 'moduleSlug', module_slug,
      'chapterTitle', chapter_title, 'topicTitle', topic_title,
      'dueOn', due_on
    ) order by due_on, answered_at nulls first, id) from due_questions), '[]'::jsonb),
    'recommendedTopics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'topicSlug', slug,
      'chapterTitle', chapter_title, 'chapterSlug', chapter_slug,
      'moduleId', module_id, 'moduleName', module_name,
      'moduleSlug', module_slug
    )) from recommended_topics), '[]'::jsonb),
    'nearestExam', (select jsonb_build_object(
      'moduleId', id, 'moduleName', name, 'moduleSlug', slug,
      'examDate', exam_date, 'topicsCount', topics_count,
      'completedTopicsCount', completed_topics_count
    ) from nearest_exam),
    'weeklyGoal', jsonb_build_object(
      'target', coalesce((select weekly_topics from public.study_goals
        where user_id = (select auth.uid())), 5),
      'enabled', coalesce((select weekly_topics_enabled from public.study_goals
        where user_id = (select auth.uid())), true),
      'completed', (select completed from weekly_progress)
    ),
    'recentSummary', (select jsonb_build_object(
      'sessionId', id, 'completedAt', completed_at, 'answers', answers,
      'successful', successful, 'durationSeconds', duration_seconds
    ) from recent_summary),
    'sessionTarget', coalesce(
      (select jsonb_build_object('moduleId', module_id,
        'moduleName', module_name, 'moduleSlug', module_slug)
       from session_target),
      (select jsonb_build_object('moduleId', module.id,
        'moduleName', module.name, 'moduleSlug', module.slug)
       from module_progress as module
       where exists (
         select 1 from public.questions as question
         where question.module_id = module.id
           and question.user_id = (select auth.uid())
           and question.trash_id is null
           and exists (
             select 1 from public.question_options as option
             where option.question_id = question.id
               and option.user_id = (select auth.uid())
           )
       )
       order by module.exam_date asc nulls last, module.is_pinned desc,
         module.position, module.id limit 1)
    ),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'examDate', exam_date
    ) order by name, id) from module_progress), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_today_dashboard(text) from public, anon;
grant execute on function public.get_today_dashboard(text) to authenticated;
