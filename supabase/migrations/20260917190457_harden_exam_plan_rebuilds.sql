alter table public.exam_plans
add column last_rebuilt_on date;

create or replace function private.validate_exam_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.module_id is distinct from old.module_id
  ) then
    raise exception 'Nie można zmienić właściciela ani modułu istniejącego planu.';
  end if;

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

create or replace function private.sync_module_exam_date_from_plans()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.modules as module
    set exam_date = (
      select min(plan.exam_date)
      from public.exam_plans as plan
      where plan.module_id = old.module_id
        and plan.user_id = old.user_id
        and plan.status = 'active'
    )
    where module.id = old.module_id
      and module.user_id = old.user_id;
  end if;

  if tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and (
        new.module_id is distinct from old.module_id
        or new.user_id is distinct from old.user_id
      )
    )
  then
    update public.modules as module
    set exam_date = (
      select min(plan.exam_date)
      from public.exam_plans as plan
      where plan.module_id = new.module_id
        and plan.user_id = new.user_id
        and plan.status = 'active'
    )
    where module.id = new.module_id
      and module.user_id = new.user_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger sync_module_exam_date_from_plans on public.exam_plans;
create trigger sync_module_exam_date_from_plans
after insert or update of module_id, user_id, exam_date, status or delete
on public.exam_plans
for each row execute function private.sync_module_exam_date_from_plans();

create or replace function public.save_exam_plan(plan_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  saved_id uuid := nullif(plan_payload->>'id', '')::uuid;
  expected_version integer := nullif(plan_payload->>'expectedPlanVersion', '')::integer;
  rebuilt_on date := nullif(plan_payload->>'rebuiltOn', '')::date;
begin
  if owner_id is null then
    raise exception 'Musisz być zalogowany.';
  end if;

  if saved_id is null then
    saved_id := gen_random_uuid();
    insert into public.exam_plans (
      id, user_id, module_id, name, exam_date, target_retention,
      study_weekdays, daily_time_limit_minutes, daily_question_limit,
      buffer_percent, include_unassigned_questions, last_rebuilt_on
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
      coalesce((plan_payload->>'includeUnassignedQuestions')::boolean, false),
      rebuilt_on
    );
  else
    if expected_version is null then
      raise exception using
        errcode = '22023',
        message = 'Brakuje wersji planu wymaganej do bezpiecznego zapisu.';
    end if;

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
      needs_rebuild = case
        when rebuilt_on is not null then false
        else needs_rebuild
      end,
      last_rebuilt_on = coalesce(rebuilt_on, last_rebuilt_on),
      plan_version = plan_version + 1
    where id = saved_id
      and user_id = owner_id
      and plan_version = expected_version;

    if not found then
      if exists (
        select 1 from public.exam_plans
        where id = saved_id and user_id = owner_id
      ) then
        raise exception using
          errcode = '40001',
          message = 'Plan został zmieniony w innym miejscu. Odśwież widok i spróbuj ponownie.';
      end if;
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
