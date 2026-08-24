begin;

create or replace function public.get_question_bank_availability(
  selected_chapter_id uuid default null,
  selected_topic_id uuid default null,
  only_unassigned boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with owned_questions as (
    select question.id
    from public.questions as question
    where question.user_id = (select auth.uid())
      and (selected_chapter_id is null or question.chapter_id = selected_chapter_id)
      and (selected_topic_id is null or question.topic_id = selected_topic_id)
      and (not only_unassigned or (question.chapter_id is null and question.topic_id is null))
  ),
  option_counts as (
    select question.id, count(option.id) as option_count
    from owned_questions as question
    left join public.question_options as option
      on option.question_id = question.id
      and option.user_id = (select auth.uid())
    group by question.id
  )
  select jsonb_build_object(
    'flashcardsCount', count(*) filter (where option_count >= 1),
    'testQuestionsCount', count(*) filter (where option_count >= 2)
  )
  from option_counts;
$$;

revoke all on function public.get_question_bank_availability(uuid, uuid, boolean) from public;
grant execute on function public.get_question_bank_availability(uuid, uuid, boolean) to authenticated;

create or replace function public.create_study_session(
  study_mode text,
  scope_mode text,
  selected_chapter_id uuid default null,
  selected_topic_id uuid default null,
  random_chapter_count integer default 3,
  requested_question_count integer default 20
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_id uuid;
  inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
  then
    raise exception 'Nieprawidłowa konfiguracja sesji.';
  end if;

  insert into public.study_sessions (user_id, mode, configuration)
  values (
    (select auth.uid()),
    study_mode,
    jsonb_build_object(
      'scope', scope_mode,
      'chapterId', selected_chapter_id,
      'topicId', selected_topic_id
    )
  )
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id
    from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and exists (
        select 1
        from public.questions as question
        join public.question_options as option
          on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id
          and question.user_id = (select auth.uid())
        group by question.id
        having study_mode = 'flashcards' or count(option.id) >= 2
      )
    order by random()
    limit greatest(1, random_chapter_count)
  ),
  candidates as (
    select
      question.id,
      question.content,
      question.explanation,
      jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'content', option.content,
          'isCorrect', option.is_correct
        )
        order by option.position
      ) as option_data,
      count(option.id) as option_count
    from public.questions as question
    join public.question_options as option
      on option.question_id = question.id
      and option.user_id = (select auth.uid())
    where question.user_id = (select auth.uid())
      and (
        scope_mode = 'all'
        or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
        or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
        or (
          scope_mode = 'unassigned'
          and question.chapter_id is null
          and question.topic_id is null
        )
        or (
          scope_mode = 'random_chapters'
          and question.chapter_id in (select id from random_chapters)
        )
      )
    group by question.id
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random()
    limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items (
    user_id,
    session_id,
    question_id,
    position,
    question_snapshot,
    options_snapshot,
    explanation_snapshot
  )
  select
    (select auth.uid()),
    created_id,
    id,
    row_number() over ()::integer,
    content,
    option_data,
    explanation
  from candidates;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;

  return created_id;
end;
$$;

revoke all on function public.create_study_session(text, text, uuid, uuid, integer, integer) from public;
grant execute on function public.create_study_session(text, text, uuid, uuid, integer, integer) to authenticated;

commit;
