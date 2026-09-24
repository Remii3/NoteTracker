drop function if exists public.create_study_session(
  uuid, text, text, uuid, uuid, integer, integer
);

create function public.create_study_session(
  target_module_id uuid,
  study_mode text,
  scope_mode text,
  selected_chapter_id uuid default null,
  selected_topic_id uuid default null,
  random_chapter_count integer default 3,
  requested_question_count integer default 20,
  hide_flashcard_options boolean default false
) returns uuid
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
    or not exists (
      select 1
      from public.modules
      where id = target_module_id
        and user_id = (select auth.uid())
        and trash_id is null
    )
  then
    raise exception 'Nieprawidłowa konfiguracja sesji.';
  end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values (
    (select auth.uid()),
    target_module_id,
    study_mode,
    pg_catalog.jsonb_build_object(
      'scope', scope_mode,
      'chapterId', selected_chapter_id,
      'topicId', selected_topic_id,
      'hideFlashcardOptions',
        study_mode = 'flashcards' and coalesce(hide_flashcard_options, false)
    )
  )
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id
    from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
      and exists (
        select 1
        from public.questions as question
        join public.question_options as option
          on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id
          and question.user_id = (select auth.uid())
          and question.module_id = target_module_id
          and question.trash_id is null
        group by question.id
        having study_mode = 'flashcards' or pg_catalog.count(option.id) >= 2
      )
    order by pg_catalog.random()
    limit greatest(1, random_chapter_count)
  ), candidates as (
    select
      question.id,
      question.content,
      question.explanation,
      question.chapter_id,
      question.topic_id,
      chapter.title as chapter_title,
      topic.title as topic_title,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', option.id,
          'content', option.content,
          'isCorrect', option.is_correct
        )
        order by option.position
      ) as option_data
    from public.questions as question
    join public.question_options as option
      on option.question_id = question.id
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
    group by question.id, chapter.title, topic.title
    having study_mode = 'flashcards' or pg_catalog.count(option.id) >= 2
    order by pg_catalog.random()
    limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items (
    user_id,
    session_id,
    question_id,
    position,
    question_snapshot,
    options_snapshot,
    explanation_snapshot,
    chapter_id_snapshot,
    topic_id_snapshot,
    chapter_title_snapshot,
    topic_title_snapshot
  )
  select
    (select auth.uid()),
    created_id,
    id,
    pg_catalog.row_number() over ()::integer,
    content,
    option_data,
    explanation,
    chapter_id,
    topic_id,
    chapter_title,
    topic_title
  from candidates;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;

  return created_id;
end;
$$;

revoke all on function public.create_study_session(
  uuid, text, text, uuid, uuid, integer, integer, boolean
) from public, anon;
grant execute on function public.create_study_session(
  uuid, text, text, uuid, uuid, integer, integer, boolean
) to authenticated;
