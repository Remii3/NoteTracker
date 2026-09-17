create table public.fsrs_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  desired_retention double precision not null default 0.9,
  parameters double precision[],
  parameters_version integer not null default 1,
  optimized_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint fsrs_profiles_retention_check
    check (desired_retention between 0.7 and 0.99),
  constraint fsrs_profiles_parameters_check
    check (parameters is null or cardinality(parameters) = 21)
);

comment on table public.fsrs_profiles is
  'Per-user FSRS v6 retention and optional optimizer-generated weights.';

create table public.question_review_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  state text not null default 'new',
  version integer not null default 0,
  parameters_version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id),
  constraint question_review_states_state_check
    check (state in ('new', 'learning', 'review', 'relearning')),
  constraint question_review_states_values_check check (
    stability >= 0 and difficulty >= 0 and elapsed_days >= 0
    and scheduled_days >= 0 and learning_steps >= 0
    and repetitions >= 0 and lapses >= 0 and version >= 0
  )
);

create table public.question_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete set null,
  session_item_id uuid references public.study_session_items(id) on delete set null,
  reviewed_at timestamptz not null,
  rating smallint not null,
  duration_seconds integer not null default 0,
  state_before text not null,
  state_after text not null,
  due_before timestamptz not null,
  due_after timestamptz not null,
  stability_before double precision not null,
  stability_after double precision not null,
  difficulty_before double precision not null,
  difficulty_after double precision not null,
  elapsed_days integer not null,
  scheduled_days integer not null,
  algorithm_version text not null default 'FSRS-6',
  parameters_version integer not null,
  constraint question_review_logs_rating_check check (rating between 1 and 4),
  constraint question_review_logs_state_before_check
    check (state_before in ('new', 'learning', 'review', 'relearning')),
  constraint question_review_logs_state_after_check
    check (state_after in ('new', 'learning', 'review', 'relearning')),
  constraint question_review_logs_duration_check
    check (duration_seconds between 0 and 86400)
);

create index question_review_states_due_idx
  on public.question_review_states (user_id, due_at, question_id);
create index question_review_logs_user_reviewed_idx
  on public.question_review_logs (user_id, reviewed_at, id);
create index question_review_logs_question_reviewed_idx
  on public.question_review_logs (user_id, question_id, reviewed_at);

alter table public.fsrs_profiles enable row level security;
alter table public.question_review_states enable row level security;
alter table public.question_review_logs enable row level security;

revoke all on table public.fsrs_profiles from anon, authenticated;
revoke all on table public.question_review_states from anon, authenticated;
revoke all on table public.question_review_logs from anon, authenticated;
grant select, insert, update on table public.fsrs_profiles to authenticated;
grant select on table public.question_review_states to authenticated;
grant select on table public.question_review_logs to authenticated;

create policy "Users manage own FSRS profile"
on public.fsrs_profiles for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users read own review states"
on public.question_review_states for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users read own review logs"
on public.question_review_logs for select to authenticated
using ((select auth.uid()) = user_id);

create function public.record_fsrs_review(
  target_session_item_id uuid,
  review_rating smallint,
  review_time timestamptz,
  selected_option uuid,
  duration_seconds integer,
  expected_version integer,
  next_due_at timestamptz,
  next_stability double precision,
  next_difficulty double precision,
  next_elapsed_days integer,
  next_scheduled_days integer,
  next_learning_steps integer,
  next_repetitions integer,
  next_lapses integer,
  next_state text,
  used_parameters_version integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_item public.study_session_items%rowtype;
  current_state public.question_review_states%rowtype;
  profile_version integer;
  result_value text;
begin
  if review_rating not between 1 and 4
    or review_time > now() + interval '5 minutes'
    or next_due_at < review_time
    or duration_seconds not between 0 and 86400
    or next_state not in ('new', 'learning', 'review', 'relearning')
    or least(next_stability, next_difficulty) < 0
    or least(next_elapsed_days, next_scheduled_days, next_learning_steps,
      next_repetitions, next_lapses) < 0
  then raise exception 'Nieprawidłowe dane powtórki FSRS.'; end if;

  select item.* into target_item
  from public.study_session_items as item
  join public.study_sessions as session on session.id = item.session_id
  where item.id = target_session_item_id
    and item.user_id = (select auth.uid())
    and session.user_id = (select auth.uid())
    and session.status = 'in_progress'
    and item.question_id is not null
  for update of item;
  if target_item.id is null or target_item.result is not null then
    raise exception 'Odpowiedź została już zapisana albo sesja jest nieaktywna.';
  end if;

  insert into public.fsrs_profiles (user_id)
  values ((select auth.uid())) on conflict (user_id) do nothing;
  select parameters_version into profile_version from public.fsrs_profiles
  where user_id = (select auth.uid());
  if profile_version <> used_parameters_version then
    raise exception 'Parametry FSRS zmieniły się. Odśwież sesję.';
  end if;

  select * into current_state from public.question_review_states
  where user_id = (select auth.uid()) and question_id = target_item.question_id
  for update;
  if current_state.question_id is null then
    current_state.user_id := (select auth.uid());
    current_state.question_id := target_item.question_id;
    current_state.due_at := review_time;
    current_state.stability := 0;
    current_state.difficulty := 0;
    current_state.state := 'new';
    current_state.version := 0;
  end if;
  if current_state.version <> expected_version then
    raise exception 'Stan pytania zmienił się. Odśwież sesję.';
  end if;

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
    (select auth.uid()), target_item.question_id, next_due_at, review_time,
    next_stability, next_difficulty, next_elapsed_days, next_scheduled_days,
    next_learning_steps, next_repetitions, next_lapses, next_state,
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
    (select auth.uid()), target_item.question_id, target_item.session_id,
    target_item.id, review_time, review_rating, duration_seconds,
    current_state.state, next_state, current_state.due_at, next_due_at,
    current_state.stability, next_stability, current_state.difficulty,
    next_difficulty, next_elapsed_days, next_scheduled_days,
    used_parameters_version
  );

  update public.study_session_items set result = result_value,
    selected_option_id = selected_option, answered_at = review_time,
    active_duration_seconds = duration_seconds
  where id = target_item.id;

  return jsonb_build_object('result', result_value,
    'version', expected_version + 1, 'dueAt', next_due_at);
end;
$$;

revoke all on function public.record_fsrs_review(uuid, smallint, timestamptz,
  uuid, integer, integer, timestamptz, double precision, double precision,
  integer, integer, integer, integer, integer, text, integer) from public, anon;
grant execute on function public.record_fsrs_review(uuid, smallint, timestamptz,
  uuid, integer, integer, timestamptz, double precision, double precision,
  integer, integer, integer, integer, integer, text, integer) to authenticated;

create function public.save_fsrs_profile(
  requested_retention double precision,
  optimized_parameters double precision[] default null
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare next_version integer;
begin
  if requested_retention not between 0.7 and 0.99
    or (optimized_parameters is not null and (
      cardinality(optimized_parameters) <> 21
      or exists (select 1 from unnest(optimized_parameters) value
        where value is null or not (value between -1000000 and 1000000))
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

create function public.get_fsrs_due_questions(timezone_name text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with due_rows as (
    select question.id, question.content, module.id as module_id,
      module.name as module_name, module.slug as module_slug,
      chapter.title as chapter_title, topic.title as topic_title,
      timezone(timezone_name, coalesce(review.due_at, now()))::date as due_on,
      review.due_at
    from public.questions as question
    join public.modules as module on module.id = question.module_id
    and module.user_id = question.user_id and module.trash_id is null
    left join public.chapters as chapter on chapter.id = question.chapter_id
    and chapter.trash_id is null
    left join public.topics as topic on topic.id = question.topic_id
    and topic.trash_id is null
    left join public.question_review_states as review
    on review.user_id = question.user_id and review.question_id = question.id
    where question.user_id = (select auth.uid()) and question.trash_id is null
    and (review.question_id is null or review.due_at <= now())
    and exists (select 1 from public.question_options as option
      where option.question_id = question.id and option.user_id = (select auth.uid()))
    and not exists (
      select 1 from public.study_task_deferrals as deferral
      where deferral.user_id = (select auth.uid())
        and deferral.task_type = 'question' and deferral.task_id = question.id
        and deferral.deferred_until > timezone(timezone_name, now())::date
    )
    order by review.due_at nulls first, question.id limit 8
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'content', content, 'moduleId', module_id,
    'moduleName', module_name, 'moduleSlug', module_slug,
    'chapterTitle', chapter_title, 'topicTitle', topic_title,
    'dueOn', due_on
  ) order by due_at nulls first, id), '[]'::jsonb) from due_rows;
$$;

revoke all on function public.get_fsrs_due_questions(text) from public, anon;
grant execute on function public.get_fsrs_due_questions(text) to authenticated;

create function public.create_fsrs_study_session(
  target_module_id uuid,
  requested_question_count integer default 10
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare created_id uuid; inserted_count integer;
begin
  if requested_question_count not between 1 and 100
    or not exists (select 1 from public.modules where id = target_module_id
      and user_id = (select auth.uid()) and trash_id is null)
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, 'flashcards',
    jsonb_build_object('scope', 'fsrs_due')) returning id into created_id;

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
    left join public.topics as topic on topic.id = question.topic_id
    left join public.question_review_states as review
      on review.user_id = question.user_id and review.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.module_id = target_module_id and question.trash_id is null
      and (review.question_id is null or review.due_at <= now())
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

revoke all on function public.create_fsrs_study_session(uuid, integer)
  from public, anon;
grant execute on function public.create_fsrs_study_session(uuid, integer)
  to authenticated;
