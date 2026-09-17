create table public.exam_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  name text not null,
  exam_date date not null,
  target_retention numeric(4, 3) not null default 0.900,
  study_weekdays smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  daily_time_limit_minutes integer,
  daily_question_limit integer,
  buffer_percent smallint not null default 10,
  include_unassigned_questions boolean not null default false,
  status text not null default 'active',
  needs_rebuild boolean not null default false,
  plan_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_plans_name_check check (btrim(name) <> ''),
  constraint exam_plans_target_retention_check
    check (target_retention between 0.700 and 0.990),
  constraint exam_plans_study_weekdays_check check (
    cardinality(study_weekdays) between 1 and 7
    and study_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint exam_plans_time_limit_check check (
    daily_time_limit_minutes is null or daily_time_limit_minutes between 5 and 1440
  ),
  constraint exam_plans_question_limit_check check (
    daily_question_limit is null or daily_question_limit between 1 and 1000
  ),
  constraint exam_plans_buffer_check check (buffer_percent between 0 and 30),
  constraint exam_plans_status_check check (status in ('active', 'completed', 'archived'))
);

comment on table public.exam_plans is
  'Independent exam deadlines and planning preferences. A module may have many overlapping plans.';

create table public.exam_plan_topics (
  exam_plan_id uuid not null references public.exam_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  workload_points smallint not null default 2,
  workload_source text not null default 'automatic',
  created_at timestamptz not null default now(),
  primary key (exam_plan_id, topic_id),
  constraint exam_plan_topics_workload_check check (workload_points between 1 and 6),
  constraint exam_plan_topics_source_check check (workload_source in ('automatic', 'manual'))
);

comment on table public.exam_plan_topics is
  'Resolved topic scope for an exam. Chapter and module selections are expanded to topics when saved.';

create table public.exam_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_plan_id uuid not null references public.exam_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  scheduled_for date not null,
  position integer not null,
  workload_points smallint not null,
  is_locked boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_plan_id, topic_id),
  unique (exam_plan_id, scheduled_for, position),
  constraint exam_plan_assignments_position_check check (position > 0),
  constraint exam_plan_assignments_workload_check check (workload_points between 1 and 6)
);

create table public.exam_plan_daily_targets (
  exam_plan_id uuid not null references public.exam_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_date date not null,
  topic_count integer not null default 0,
  workload_points integer not null default 0,
  review_target integer not null default 0,
  review_forecast_low integer not null default 0,
  review_forecast_high integer not null default 0,
  is_buffer_day boolean not null default false,
  is_overloaded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (exam_plan_id, target_date),
  constraint exam_plan_daily_targets_counts_check check (
    topic_count >= 0
    and workload_points >= 0
    and review_target >= 0
    and review_forecast_low >= 0
    and review_forecast_high >= review_forecast_low
  )
);

create index exam_plans_user_exam_date_idx
  on public.exam_plans (user_id, exam_date)
  where status = 'active';
create index exam_plans_module_exam_date_idx
  on public.exam_plans (module_id, exam_date)
  where status = 'active';
create index exam_plan_topics_topic_idx
  on public.exam_plan_topics (topic_id, exam_plan_id);
create index exam_plan_assignments_user_date_idx
  on public.exam_plan_assignments (user_id, scheduled_for);
create index exam_plan_daily_targets_user_date_idx
  on public.exam_plan_daily_targets (user_id, target_date);

create function private.validate_exam_plan_child()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid;
  owner_module_id uuid;
  topic_module_id uuid;
begin
  select plan.user_id, plan.module_id
  into owner_id, owner_module_id
  from public.exam_plans as plan
  where plan.id = new.exam_plan_id;

  if owner_id is null or owner_id is distinct from new.user_id then
    raise exception 'Nieprawidłowy właściciel planu egzaminu.';
  end if;

  if tg_table_name in ('exam_plan_topics', 'exam_plan_assignments') then
    select chapter.module_id
    into topic_module_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = new.topic_id
      and topic.user_id = new.user_id
      and topic.trash_id is null
      and chapter.user_id = new.user_id
      and chapter.trash_id is null;

    if topic_module_id is null or topic_module_id is distinct from owner_module_id then
      raise exception 'Temat nie należy do modułu planu egzaminu.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_exam_plan_topic
before insert or update on public.exam_plan_topics
for each row execute function private.validate_exam_plan_child();

create trigger validate_exam_plan_assignment
before insert or update on public.exam_plan_assignments
for each row execute function private.validate_exam_plan_child();

create trigger validate_exam_plan_daily_target
before insert or update on public.exam_plan_daily_targets
for each row execute function private.validate_exam_plan_child();

create function private.validate_exam_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = new.module_id
      and module.user_id = new.user_id
      and module.trash_id is null
  ) then
    raise exception 'Moduł planu egzaminu jest niedostępny.';
  end if;

  new.study_weekdays := array(
    select distinct weekday
    from unnest(new.study_weekdays) as weekday
    order by weekday
  );
  new.updated_at := now();
  return new;
end;
$$;

create trigger validate_exam_plan
before insert or update on public.exam_plans
for each row execute function private.validate_exam_plan();

create function private.sync_module_exam_date_from_plans()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_module_id uuid;
  owner_id uuid;
begin
  if tg_op = 'DELETE' then
    affected_module_id := old.module_id;
    owner_id := old.user_id;
  else
    affected_module_id := new.module_id;
    owner_id := new.user_id;
  end if;
  update public.modules as module
  set exam_date = (
    select min(plan.exam_date)
    from public.exam_plans as plan
    where plan.module_id = affected_module_id
      and plan.user_id = owner_id
      and plan.status = 'active'
  )
  where module.id = affected_module_id
    and module.user_id = owner_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger sync_module_exam_date_from_plans
after insert or update of exam_date, status or delete on public.exam_plans
for each row execute function private.sync_module_exam_date_from_plans();

create function private.mark_exam_plans_dirty_on_topic_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.completed is distinct from new.completed then
    update public.exam_plans as plan
    set needs_rebuild = true,
      updated_at = now()
    where plan.user_id = new.user_id
      and plan.status = 'active'
      and exists (
        select 1
        from public.exam_plan_topics as scope
        where scope.exam_plan_id = plan.id
          and scope.topic_id = new.id
          and scope.user_id = new.user_id
      );
  end if;
  return new;
end;
$$;

create trigger mark_exam_plans_dirty_on_topic_change
after update of completed on public.topics
for each row execute function private.mark_exam_plans_dirty_on_topic_change();

alter table public.exam_plans enable row level security;
alter table public.exam_plan_topics enable row level security;
alter table public.exam_plan_assignments enable row level security;
alter table public.exam_plan_daily_targets enable row level security;

revoke all on table public.exam_plans from anon, authenticated;
revoke all on table public.exam_plan_topics from anon, authenticated;
revoke all on table public.exam_plan_assignments from anon, authenticated;
revoke all on table public.exam_plan_daily_targets from anon, authenticated;

grant select, insert, update, delete on table public.exam_plans to authenticated;
grant select, insert, update, delete on table public.exam_plan_topics to authenticated;
grant select, insert, update, delete on table public.exam_plan_assignments to authenticated;
grant select, insert, update, delete on table public.exam_plan_daily_targets to authenticated;

create policy "Users manage own exam plans"
on public.exam_plans to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own exam plan topics"
on public.exam_plan_topics to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own exam plan assignments"
on public.exam_plan_assignments to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own exam plan daily targets"
on public.exam_plan_daily_targets to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.save_exam_plan(plan_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  saved_id uuid := nullif(plan_payload->>'id', '')::uuid;
begin
  if owner_id is null then
    raise exception 'Musisz być zalogowany.';
  end if;

  if saved_id is null then
    saved_id := gen_random_uuid();
    insert into public.exam_plans (
      id, user_id, module_id, name, exam_date, target_retention,
      study_weekdays, daily_time_limit_minutes, daily_question_limit,
      buffer_percent, include_unassigned_questions
    ) values (
      saved_id,
      owner_id,
      (plan_payload->>'moduleId')::uuid,
      btrim(plan_payload->>'name'),
      (plan_payload->>'examDate')::date,
      (plan_payload->>'targetRetention')::numeric,
      array(
        select value::smallint
        from jsonb_array_elements_text(plan_payload->'studyWeekdays') as value
      ),
      nullif(plan_payload->>'dailyTimeLimitMinutes', '')::integer,
      nullif(plan_payload->>'dailyQuestionLimit', '')::integer,
      (plan_payload->>'bufferPercent')::smallint,
      coalesce((plan_payload->>'includeUnassignedQuestions')::boolean, false)
    );
  else
    update public.exam_plans
    set name = btrim(plan_payload->>'name'),
      exam_date = (plan_payload->>'examDate')::date,
      target_retention = (plan_payload->>'targetRetention')::numeric,
      study_weekdays = array(
        select value::smallint
        from jsonb_array_elements_text(plan_payload->'studyWeekdays') as value
      ),
      daily_time_limit_minutes = nullif(plan_payload->>'dailyTimeLimitMinutes', '')::integer,
      daily_question_limit = nullif(plan_payload->>'dailyQuestionLimit', '')::integer,
      buffer_percent = (plan_payload->>'bufferPercent')::smallint,
      include_unassigned_questions = coalesce(
        (plan_payload->>'includeUnassignedQuestions')::boolean,
        false
      ),
      needs_rebuild = false,
      plan_version = plan_version + 1
    where id = saved_id and user_id = owner_id;

    if not found then
      raise exception 'Nie znaleziono planu egzaminu.';
    end if;

    delete from public.exam_plan_topics
    where exam_plan_id = saved_id and user_id = owner_id;
    delete from public.exam_plan_assignments
    where exam_plan_id = saved_id and user_id = owner_id;
    delete from public.exam_plan_daily_targets
    where exam_plan_id = saved_id and user_id = owner_id;
  end if;

  insert into public.exam_plan_topics (
    exam_plan_id, user_id, topic_id, workload_points, workload_source
  )
  select saved_id, owner_id, source.id, source.workload_points, source.workload_source
  from jsonb_to_recordset(coalesce(plan_payload->'topicSettings', '[]'::jsonb))
    as source(id uuid, workload_points smallint, workload_source text);

  insert into public.exam_plan_assignments (
    exam_plan_id, user_id, topic_id, scheduled_for, position,
    workload_points, is_locked, completed_at
  )
  select saved_id, owner_id, source.topic_id, source.scheduled_for,
    source.position, source.workload_points, source.is_locked, source.completed_at
  from jsonb_to_recordset(coalesce(plan_payload->'assignments', '[]'::jsonb))
    as source(
      topic_id uuid,
      scheduled_for date,
      position integer,
      workload_points smallint,
      is_locked boolean,
      completed_at timestamptz
    );

  insert into public.exam_plan_daily_targets (
    exam_plan_id, user_id, target_date, topic_count, workload_points,
    review_target, review_forecast_low, review_forecast_high,
    is_buffer_day, is_overloaded
  )
  select saved_id, owner_id, source.target_date, source.topic_count,
    source.workload_points, source.review_target, source.review_forecast_low,
    source.review_forecast_high, source.is_buffer_day, source.is_overloaded
  from jsonb_to_recordset(coalesce(plan_payload->'days', '[]'::jsonb))
    as source(
      target_date date,
      topic_count integer,
      workload_points integer,
      review_target integer,
      review_forecast_low integer,
      review_forecast_high integer,
      is_buffer_day boolean,
      is_overloaded boolean
    );

  return saved_id;
end;
$$;

revoke all on function public.save_exam_plan(jsonb) from public, anon;
grant execute on function public.save_exam_plan(jsonb) to authenticated;

revoke all on function private.validate_exam_plan_child() from public;
revoke all on function private.validate_exam_plan() from public;
revoke all on function private.mark_exam_plans_dirty_on_topic_change() from public;
revoke all on function private.sync_module_exam_date_from_plans() from public;
