-- This migration intentionally supersedes the already-applied FSRS migration.
-- Keep review-state tables read-only through the Data API and perform the
-- authoritative state transition in a non-exposed schema.

create schema if not exists private;
revoke all on schema private from public, anon;

create or replace function private.fsrs_round8(value double precision)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  select round(value::numeric, 8)::double precision;
$$;

create or replace function private.calculate_fsrs_v6_transition(
  current_state public.question_review_states,
  review_rating smallint,
  review_time timestamptz,
  desired_retention double precision,
  parameters double precision[]
) returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  default_parameters constant double precision[] := array[
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
    0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
    1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
  ];
  weights double precision[] := coalesce(parameters, default_parameters);
  old_state text := coalesce(current_state.state, 'new');
  old_stability double precision := coalesce(current_state.stability, 0);
  old_difficulty double precision := coalesce(current_state.difficulty, 0);
  old_steps integer := coalesce(current_state.learning_steps, 0);
  elapsed integer := 0;
  next_stability double precision;
  next_difficulty double precision;
  next_state text;
  next_steps integer := 0;
  next_scheduled integer := 0;
  next_lapses integer := coalesce(current_state.lapses, 0);
  next_repetitions integer := coalesce(current_state.repetitions, 0) + 1;
  scheduled_minutes integer;
  due_at timestamptz;
  retrievability double precision;
  decay double precision;
  factor double precision;
  interval_modifier double precision;
  hard_stability double precision;
  good_stability double precision;
  easy_stability double precision;
  hard_interval integer;
  good_interval integer;
  easy_interval integer;
  stability_increase double precision;
begin
  if review_rating not between 1 and 4
    or desired_retention not between 0.7 and 0.99
    or cardinality(weights) <> 21
  then raise exception 'Nieprawidłowe dane harmonogramu FSRS.'; end if;

  if old_state <> 'new' and current_state.last_reviewed_at is not null then
    elapsed := greatest(0,
      (review_time at time zone 'UTC')::date
      - (current_state.last_reviewed_at at time zone 'UTC')::date);
  end if;

  decay := -weights[21];
  factor := private.fsrs_round8(exp(ln(0.9) / decay) - 1);
  interval_modifier := private.fsrs_round8(
    (power(desired_retention, 1 / decay) - 1) / factor);

  if old_stability = 0 and old_difficulty = 0 then
    next_stability := greatest(weights[review_rating], 0.1);
    next_difficulty := private.fsrs_round8(
      least(10, greatest(1,
        weights[5] - exp((review_rating - 1) * weights[6]) + 1)));
  else
    retrievability := private.fsrs_round8(
      power(1 + factor * elapsed / old_stability, decay));
    next_difficulty := private.fsrs_round8(least(10, greatest(1,
      weights[8]
        * private.fsrs_round8(weights[5] - exp(3 * weights[6]) + 1)
      + (1 - weights[8]) * (
          old_difficulty
          + private.fsrs_round8(
              (-weights[7] * (review_rating - 3))
              * (10 - old_difficulty) / 9)
        )
    )));

    if elapsed = 0 then
      stability_increase := power(old_stability, -weights[20])
        * exp(weights[18] * (review_rating - 3 + weights[19]));
      if review_rating >= 2 then
        stability_increase := greatest(stability_increase, 1);
      end if;
      next_stability := private.fsrs_round8(least(36500, greatest(0.001,
        old_stability * stability_increase)));
    elsif review_rating = 1 then
      next_stability := private.fsrs_round8(least(
        least(36500, greatest(0.001,
          weights[12] * power(old_difficulty, -weights[13])
          * (power(old_stability + 1, weights[14]) - 1)
          * exp((1 - retrievability) * weights[15])
        )),
        greatest(0.001,
          private.fsrs_round8(old_stability / exp(weights[18] * weights[19])))
      ));
    else
      next_stability := private.fsrs_round8(least(36500, greatest(0.001,
        old_stability * (
          1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1)
          * case when review_rating = 2 then weights[16] else 1 end
          * case when review_rating = 4 then weights[17] else 1 end
        )
      )));
    end if;
  end if;

  -- Default ts-fsrs 5.4.2 learning steps: 1m, 10m; relearning: 10m.
  if old_state = 'review' and review_rating = 1 then
    scheduled_minutes := 10;
    next_state := 'relearning';
    next_lapses := next_lapses + 1;
  elsif old_state = 'relearning' and review_rating = 1 then
    scheduled_minutes := 10;
    next_state := 'relearning';
  elsif old_state = 'relearning' and review_rating = 2 then
    scheduled_minutes := 15;
    next_state := 'relearning';
  elsif old_state in ('new', 'learning') and review_rating = 1 then
    scheduled_minutes := 1;
    next_state := 'learning';
  elsif old_state in ('new', 'learning') and review_rating = 2 then
    scheduled_minutes := 6;
    next_state := 'learning';
    next_steps := old_steps;
  elsif old_state in ('new', 'learning') and review_rating = 3 and old_steps = 0 then
    scheduled_minutes := 10;
    next_state := 'learning';
    next_steps := 1;
  else
    next_state := 'review';

    if old_state = 'review' then
      -- Review intervals are ordered Hard < Good < Easy by the scheduler.
      if elapsed = 0 then
        hard_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * greatest(
            power(old_stability, -weights[20])
              * exp(weights[18] * (2 - 3 + weights[19])), 1))));
        good_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * greatest(
            power(old_stability, -weights[20])
              * exp(weights[18] * (3 - 3 + weights[19])), 1))));
        easy_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * greatest(
            power(old_stability, -weights[20])
              * exp(weights[18] * (4 - 3 + weights[19])), 1))));
      else
        hard_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * (1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1) * weights[16]))));
        good_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * (1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1)))));
        easy_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * (1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1) * weights[17]))));
      end if;
      hard_interval := least(36500, greatest(1,
        round(hard_stability * interval_modifier)::integer));
      good_interval := least(36500, greatest(1,
        round(good_stability * interval_modifier)::integer));
      hard_interval := least(hard_interval, good_interval);
      good_interval := greatest(good_interval, hard_interval + 1);
      easy_interval := greatest(
        least(36500, greatest(1,
          round(easy_stability * interval_modifier)::integer)),
        good_interval + 1);
      next_scheduled := case review_rating
        when 2 then hard_interval when 3 then good_interval else easy_interval end;
    else
      next_scheduled := least(36500, greatest(1,
        round(next_stability * interval_modifier)::integer));
    end if;
  end if;

  if scheduled_minutes is not null then
    due_at := review_time + make_interval(mins => scheduled_minutes);
    next_scheduled := 0;
  else
    due_at := review_time + make_interval(days => next_scheduled);
  end if;

  return jsonb_build_object(
    'dueAt', due_at,
    'stability', next_stability,
    'difficulty', next_difficulty,
    'elapsedDays', elapsed,
    'scheduledDays', next_scheduled,
    'learningSteps', next_steps,
    'repetitions', next_repetitions,
    'lapses', next_lapses,
    'state', next_state
  );
end;
$$;

create or replace function private.record_fsrs_review(
  target_session_item_id uuid,
  review_rating smallint,
  review_time timestamptz,
  selected_option uuid,
  duration_seconds integer,
  expected_version integer,
  used_parameters_version integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_item public.study_session_items%rowtype;
  current_state public.question_review_states%rowtype;
  profile public.fsrs_profiles%rowtype;
  transition jsonb;
  result_value text;
begin
  if caller_id is null
    or review_rating not between 1 and 4
    or review_time > now() + interval '5 minutes'
    or duration_seconds not between 0 and 86400
  then raise exception 'Nieprawidłowe dane powtórki FSRS.'; end if;

  select item.* into target_item
  from public.study_session_items as item
  join public.study_sessions as session on session.id = item.session_id
  where item.id = target_session_item_id
    and item.user_id = caller_id
    and session.user_id = caller_id
    and session.status = 'in_progress'
    and item.question_id is not null
    and review_time >= session.started_at
  for update of item;
  if target_item.id is null or target_item.result is not null then
    raise exception 'Odpowiedź została już zapisana albo sesja jest nieaktywna.';
  end if;

  insert into public.fsrs_profiles (user_id)
  values (caller_id) on conflict (user_id) do nothing;
  select * into profile from public.fsrs_profiles
  where user_id = caller_id for update;
  if profile.parameters_version <> used_parameters_version then
    raise exception 'Parametry FSRS zmieniły się. Odśwież sesję.';
  end if;

  select * into current_state from public.question_review_states
  where user_id = caller_id and question_id = target_item.question_id
  for update;
  if current_state.question_id is null then
    current_state.user_id := caller_id;
    current_state.question_id := target_item.question_id;
    current_state.due_at := review_time;
    current_state.stability := 0;
    current_state.difficulty := 0;
    current_state.elapsed_days := 0;
    current_state.scheduled_days := 0;
    current_state.learning_steps := 0;
    current_state.repetitions := 0;
    current_state.lapses := 0;
    current_state.state := 'new';
    current_state.version := 0;
  end if;
  if current_state.version <> expected_version then
    raise exception 'Stan pytania zmienił się. Odśwież sesję.';
  end if;
  if current_state.last_reviewed_at is not null
    and review_time < current_state.last_reviewed_at
  then raise exception 'Data powtórki jest starsza od aktualnego stanu pytania.';
  end if;
  if selected_option is not null and not exists (
    select 1 from jsonb_array_elements(target_item.options_snapshot) option
    where option->>'id' = selected_option::text
  ) then raise exception 'Wybrana odpowiedź nie należy do pytania.';
  end if;

  transition := private.calculate_fsrs_v6_transition(
    current_state, review_rating, review_time,
    profile.desired_retention, profile.parameters);

  result_value := case
    when target_item.options_snapshot is not null and selected_option is not null
      then case when exists (
        select 1 from jsonb_array_elements(target_item.options_snapshot) option
        where option->>'id' = selected_option::text
          and (option->>'isCorrect')::boolean
      ) then 'correct' else 'incorrect' end
    when review_rating = 1 then 'forgotten'
    else 'remembered' end;

  insert into public.question_review_states (
    user_id, question_id, due_at, last_reviewed_at, stability, difficulty,
    elapsed_days, scheduled_days, learning_steps, repetitions, lapses, state,
    version, parameters_version, updated_at
  ) values (
    caller_id, target_item.question_id, (transition->>'dueAt')::timestamptz,
    review_time, (transition->>'stability')::double precision,
    (transition->>'difficulty')::double precision,
    (transition->>'elapsedDays')::integer,
    (transition->>'scheduledDays')::integer,
    (transition->>'learningSteps')::integer,
    (transition->>'repetitions')::integer,
    (transition->>'lapses')::integer, transition->>'state',
    expected_version + 1, used_parameters_version, now()
  ) on conflict (user_id, question_id) do update set
    due_at = excluded.due_at, last_reviewed_at = excluded.last_reviewed_at,
    stability = excluded.stability, difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
    learning_steps = excluded.learning_steps, repetitions = excluded.repetitions,
    lapses = excluded.lapses, state = excluded.state, version = excluded.version,
    parameters_version = excluded.parameters_version, updated_at = excluded.updated_at;

  insert into public.question_review_logs (
    user_id, question_id, session_id, session_item_id, reviewed_at, rating,
    duration_seconds, state_before, state_after, due_before, due_after,
    stability_before, stability_after, difficulty_before, difficulty_after,
    elapsed_days, scheduled_days, parameters_version
  ) values (
    caller_id, target_item.question_id, target_item.session_id, target_item.id,
    review_time, review_rating, duration_seconds, current_state.state,
    transition->>'state', current_state.due_at,
    (transition->>'dueAt')::timestamptz, current_state.stability,
    (transition->>'stability')::double precision, current_state.difficulty,
    (transition->>'difficulty')::double precision,
    (transition->>'elapsedDays')::integer,
    (transition->>'scheduledDays')::integer, used_parameters_version
  );

  update public.study_session_items set result = result_value,
    selected_option_id = selected_option, answered_at = review_time,
    active_duration_seconds = duration_seconds
  where id = target_item.id;

  return jsonb_build_object('result', result_value,
    'version', expected_version + 1, 'dueAt', transition->>'dueAt');
end;
$$;

drop function public.record_fsrs_review(uuid, smallint, timestamptz,
  uuid, integer, integer, timestamptz, double precision, double precision,
  integer, integer, integer, integer, integer, text, integer);

create function public.record_fsrs_review(
  target_session_item_id uuid,
  review_rating smallint,
  review_time timestamptz,
  selected_option uuid,
  duration_seconds integer,
  expected_version integer,
  used_parameters_version integer
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_fsrs_review(
    target_session_item_id, review_rating, review_time, selected_option,
    duration_seconds, expected_version, used_parameters_version);
$$;

revoke all on function private.fsrs_round8(double precision) from public, anon, authenticated;
revoke all on function private.calculate_fsrs_v6_transition(
  public.question_review_states, smallint, timestamptz, double precision,
  double precision[]) from public, anon, authenticated;
revoke all on function private.record_fsrs_review(
  uuid, smallint, timestamptz, uuid, integer, integer, integer)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.record_fsrs_review(
  uuid, smallint, timestamptz, uuid, integer, integer, integer)
  to authenticated;
revoke all on function public.record_fsrs_review(
  uuid, smallint, timestamptz, uuid, integer, integer, integer)
  from public, anon;
grant execute on function public.record_fsrs_review(
  uuid, smallint, timestamptz, uuid, integer, integer, integer)
  to authenticated;

create or replace function public.save_fsrs_profile(
  requested_retention double precision,
  optimized_parameters double precision[] default null
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_version integer;
  lower_bounds constant double precision[] := array[
    0.001,0.001,0.001,0.001,1,0.001,0.001,0.001,0,0,0.001,
    0.001,0.001,0.001,0,0,1,0,0,0.01,0.1
  ];
  upper_bounds constant double precision[] := array[
    100,100,100,100,10,4,4,0.75,4.5,0.8,3.5,5,0.25,0.9,
    4,1,6,2,2,0.8,0.8
  ];
begin
  if requested_retention not between 0.7 and 0.99
    or (optimized_parameters is not null and (
      cardinality(optimized_parameters) <> 21
      or exists (
        select 1 from generate_subscripts(optimized_parameters, 1) index
        where optimized_parameters[index] is null
          or optimized_parameters[index] not between lower_bounds[index]
            and upper_bounds[index]
      )
    ))
  then raise exception 'Nieprawidłowe parametry profilu FSRS.'; end if;

  insert into public.fsrs_profiles (
    user_id, desired_retention, parameters, parameters_version,
    optimized_at, updated_at
  ) values (
    (select auth.uid()), requested_retention, optimized_parameters, 1,
    case when optimized_parameters is null then null else now() end, now()
  ) on conflict (user_id) do update set
    desired_retention = excluded.desired_retention,
    parameters = coalesce(excluded.parameters, public.fsrs_profiles.parameters),
    parameters_version = case
      when excluded.parameters is not null
        or excluded.desired_retention is distinct from public.fsrs_profiles.desired_retention
      then public.fsrs_profiles.parameters_version + 1
      else public.fsrs_profiles.parameters_version end,
    optimized_at = case when excluded.parameters is null
      then public.fsrs_profiles.optimized_at else now() end,
    updated_at = now()
  returning parameters_version into next_version;
  return next_version;
end;
$$;

revoke all on function public.save_fsrs_profile(double precision,
  double precision[]) from public, anon;
grant execute on function public.save_fsrs_profile(double precision,
  double precision[]) to authenticated;

-- Older RPC accepted any finite values. Fall back to the FSRS v6 defaults if
-- such a profile exists before enforcing the real optimizer bounds.
update public.fsrs_profiles set
  parameters = null,
  parameters_version = parameters_version + 1,
  optimized_at = null,
  updated_at = now()
where parameters is not null and (
  cardinality(parameters) <> 21
  or array_position(parameters, null) is not null
  or parameters[1] not between 0.001 and 100
  or parameters[2] not between 0.001 and 100
  or parameters[3] not between 0.001 and 100
  or parameters[4] not between 0.001 and 100
  or parameters[5] not between 1 and 10
  or parameters[6] not between 0.001 and 4
  or parameters[7] not between 0.001 and 4
  or parameters[8] not between 0.001 and 0.75
  or parameters[9] not between 0 and 4.5
  or parameters[10] not between 0 and 0.8
  or parameters[11] not between 0.001 and 3.5
  or parameters[12] not between 0.001 and 5
  or parameters[13] not between 0.001 and 0.25
  or parameters[14] not between 0.001 and 0.9
  or parameters[15] not between 0 and 4
  or parameters[16] not between 0 and 1
  or parameters[17] not between 1 and 6
  or parameters[18] not between 0 and 2
  or parameters[19] not between 0 and 2
  or parameters[20] not between 0.01 and 0.8
  or parameters[21] not between 0.1 and 0.8
);

alter table public.fsrs_profiles
  drop constraint fsrs_profiles_parameters_check,
  add constraint fsrs_profiles_parameters_check check (
    parameters is null or (
      cardinality(parameters) = 21
      and array_position(parameters, null) is null
      and parameters[1] between 0.001 and 100
      and parameters[2] between 0.001 and 100
      and parameters[3] between 0.001 and 100
      and parameters[4] between 0.001 and 100
      and parameters[5] between 1 and 10
      and parameters[6] between 0.001 and 4
      and parameters[7] between 0.001 and 4
      and parameters[8] between 0.001 and 0.75
      and parameters[9] between 0 and 4.5
      and parameters[10] between 0 and 0.8
      and parameters[11] between 0.001 and 3.5
      and parameters[12] between 0.001 and 5
      and parameters[13] between 0.001 and 0.25
      and parameters[14] between 0.001 and 0.9
      and parameters[15] between 0 and 4
      and parameters[16] between 0 and 1
      and parameters[17] between 1 and 6
      and parameters[18] between 0 and 2
      and parameters[19] between 0 and 2
      and parameters[20] between 0.01 and 0.8
      and parameters[21] between 0.1 and 0.8
    )
  );

drop function public.create_fsrs_study_session(uuid, integer);

create function public.create_fsrs_study_session(
  target_module_id uuid,
  requested_question_count integer default 10,
  timezone_name text default 'UTC'
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_id uuid;
  inserted_count integer;
  today date;
begin
  if requested_question_count not between 1 and 100
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name)
    or not exists (select 1 from public.modules where id = target_module_id
      and user_id = (select auth.uid()) and trash_id is null)
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  today := timezone(timezone_name, now())::date;
  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, 'flashcards',
    jsonb_build_object('scope', 'fsrs_due', 'timeLimitMinutes', 10))
  returning id into created_id;

  with candidates as (
    select question.id, question.content, question.explanation,
      question.chapter_id, question.topic_id, chapter.title as chapter_title,
      topic.title as topic_title,
      jsonb_agg(jsonb_build_object('id', option.id, 'content', option.content,
        'isCorrect', option.is_correct) order by option.position) as option_data,
      review.due_at, review.difficulty
    from public.questions as question
    join public.question_options as option on option.question_id = question.id
      and option.user_id = (select auth.uid())
    left join public.chapters as chapter on chapter.id = question.chapter_id
      and chapter.trash_id is null
    left join public.topics as topic on topic.id = question.topic_id
      and topic.trash_id is null
    left join public.question_review_states as review
      on review.user_id = question.user_id and review.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.module_id = target_module_id and question.trash_id is null
      and (review.question_id is null or review.due_at <= now())
      and not exists (
        select 1 from public.study_task_deferrals as deferral
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'question'
          and deferral.task_id = question.id
          and deferral.deferred_until > today
      )
    group by question.id, chapter.title, topic.title,
      review.question_id, review.due_at, review.difficulty
    order by case when review.question_id is not null then 0 else 1 end,
      review.due_at nulls last, review.difficulty desc nulls last, random()
    limit requested_question_count
  )
  insert into public.study_session_items (
    user_id, session_id, question_id, position, question_snapshot,
    options_snapshot, explanation_snapshot, chapter_id_snapshot,
    topic_id_snapshot, chapter_title_snapshot, topic_title_snapshot
  ) select (select auth.uid()), created_id, id,
    row_number() over ()::integer, content, option_data, explanation,
    chapter_id, topic_id, chapter_title, topic_title from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań wymagających powtórki.';
  end if;
  return created_id;
end;
$$;

revoke all on function public.create_fsrs_study_session(uuid, integer, text)
  from public, anon;
grant execute on function public.create_fsrs_study_session(uuid, integer, text)
  to authenticated;

create or replace function public.get_today_dashboard(timezone_name text default 'UTC')
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
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name)
  then raise exception 'Nieprawidłowe parametry ekranu Dzisiaj.'; end if;

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
  due_question_rows as (
    select question.id, question.content, module.id as module_id,
      module.name as module_name, module.slug as module_slug,
      chapter.title as chapter_title, topic.title as topic_title,
      timezone(timezone_name, coalesce(review.due_at, now()))::date as due_on,
      review.due_at,
      case
        when review.question_id is null or review.state = 'new' then 'new'
        when review.state in ('learning', 'relearning') then 'learning'
        when review.due_at < now() then 'overdue'
        else 'mastered'
      end as learning_status
    from public.questions as question
    join public.modules as module on module.id = question.module_id
      and module.user_id = question.user_id and module.trash_id is null
    left join public.chapters as chapter on chapter.id = question.chapter_id
      and chapter.trash_id is null
    left join public.topics as topic on topic.id = question.topic_id
      and topic.trash_id is null
    left join public.question_review_states as review
      on review.user_id = question.user_id and review.question_id = question.id
    cross join params
    where question.user_id = (select auth.uid()) and question.trash_id is null
      and (review.question_id is null or review.due_at <= now())
      and exists (select 1 from public.question_options as option
        where option.question_id = question.id
          and option.user_id = (select auth.uid()))
      and not exists (
        select 1 from public.study_task_deferrals as deferral
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'question'
          and deferral.task_id = question.id
          and deferral.deferred_until > params.today
      )
  ),
  due_questions as (
    select * from due_question_rows
    order by due_at nulls first, id
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
      and chapter.user_id = topic.user_id and chapter.trash_id is null
    join public.modules as module
      on module.id = chapter.module_id
      and module.user_id = topic.user_id and module.trash_id is null
    cross join params
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null and not topic.completed
      and not exists (
        select 1 from public.study_task_deferrals as deferral
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
    select module.* from module_progress as module, params
    where module.exam_date >= params.today
    order by module.exam_date, module.position, module.id
    limit 1
  ),
  weekly_progress as (
    select count(*)::integer as completed
    from public.topics as topic, params
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null and topic.completed
      and timezone(timezone_name, topic.first_completed_at)::date
        >= date_trunc('week', params.today)::date
      and timezone(timezone_name, topic.first_completed_at)::date <= params.today
  ),
  recent_summary as (
    select session.id, session.completed_at,
      count(item.id) filter (where item.result is not null)::integer as answers,
      count(item.id) filter (
        where item.result in ('correct', 'remembered'))::integer as successful,
      coalesce(sum(item.active_duration_seconds), 0)::integer as duration_seconds
    from public.study_sessions as session
    join public.study_session_items as item on item.session_id = session.id
    cross join params
    where session.user_id = (select auth.uid())
      and session.trash_id is null and session.status = 'completed'
      and timezone(timezone_name, session.completed_at)::date = params.today
    group by session.id
    order by session.completed_at desc
    limit 1
  ),
  session_target as (
    select module_id, module_name, module_slug from due_question_rows
    group by module_id, module_name, module_slug
    order by count(*) desc, module_name
    limit 1
  )
  select jsonb_build_object(
    'date', (select today from params),
    'dueQuestionCount', (select count(*)::integer from due_question_rows),
    'dueQuestions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'content', content, 'moduleId', module_id,
      'moduleName', module_name, 'moduleSlug', module_slug,
      'chapterTitle', chapter_title, 'topicTitle', topic_title,
      'dueOn', due_on, 'learningStatus', learning_status
    ) order by due_at nulls first, id) from due_questions), '[]'::jsonb),
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
    'sessionTarget', (select jsonb_build_object(
      'moduleId', module_id, 'moduleName', module_name,
      'moduleSlug', module_slug) from session_target),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'examDate', exam_date
    ) order by name, id) from module_progress), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_today_dashboard(text) from public, anon;
grant execute on function public.get_today_dashboard(text) to authenticated;

-- The dashboard above is now the single source of truth for due questions.
drop function public.get_fsrs_due_questions(text);
