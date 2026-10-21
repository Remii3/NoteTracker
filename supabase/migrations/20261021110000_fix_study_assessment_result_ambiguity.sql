create or replace function public.get_study_assessment(
  target_module_id uuid default null,
  range_days integer default 30,
  timezone_name text default 'UTC'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  response_payload jsonb;
begin
  if (select auth.uid()) is null
    or range_days not in (0, 7, 30, 90)
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
    raise exception 'Nieprawidłowe filtry oceny nauki.';
  end if;

  with answers as (
    select
      session.mode,
      item.result as answer_result,
      review.rating
    from public.study_sessions as session
    join public.study_session_items as item
      on item.session_id = session.id
      and item.user_id = session.user_id
    left join public.question_review_logs as review
      on review.session_item_id = item.id
      and review.user_id = session.user_id
    where session.user_id = (select auth.uid())
      and session.trash_id is null
      and item.result is not null
      and (target_module_id is null or session.module_id = target_module_id)
      and (
        range_days = 0
        or timezone(timezone_name, item.answered_at)::date
          >= timezone(timezone_name, now())::date - (range_days - 1)
      )
  ), assessment as (
    select
      count(*) filter (where answers.mode = 'test')::integer as test_answers,
      count(*) filter (
        where answers.mode = 'test' and answers.answer_result = 'correct'
      )::integer as test_correct,
      count(*) filter (
        where answers.mode = 'flashcards'
      )::integer as flashcard_answers,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 1
      )::integer as again,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 2
      )::integer as hard,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 3
      )::integer as good,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 4
      )::integer as easy,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating is null
      )::integer as unrated
    from answers
  )
  select jsonb_build_object(
    'tests', jsonb_build_object(
      'answers', assessment.test_answers,
      'correct', assessment.test_correct,
      'accuracy', case when assessment.test_answers = 0 then 0
        else round(
          assessment.test_correct * 100.0 / assessment.test_answers
        )::integer end
    ),
    'flashcards', jsonb_build_object(
      'answers', assessment.flashcard_answers,
      'again', assessment.again,
      'hard', assessment.hard,
      'good', assessment.good,
      'easy', assessment.easy,
      'unrated', assessment.unrated
    )
  ) into response_payload
  from assessment;

  return response_payload;
end;
$$;
