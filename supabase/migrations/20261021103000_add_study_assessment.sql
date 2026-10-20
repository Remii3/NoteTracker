-- Keep objective test accuracy separate from subjective flashcard ratings.
create unique index if not exists question_review_logs_user_session_item_idx
  on public.question_review_logs (user_id, session_item_id)
  where session_item_id is not null;

create function public.get_study_assessment(
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
  result jsonb;
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
    select session.mode, item.result, review.rating
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
      count(*) filter (where mode = 'test')::integer as test_answers,
      count(*) filter (
        where mode = 'test' and result = 'correct'
      )::integer as test_correct,
      count(*) filter (where mode = 'flashcards')::integer as flashcard_answers,
      count(*) filter (where mode = 'flashcards' and rating = 1)::integer as again,
      count(*) filter (where mode = 'flashcards' and rating = 2)::integer as hard,
      count(*) filter (where mode = 'flashcards' and rating = 3)::integer as good,
      count(*) filter (where mode = 'flashcards' and rating = 4)::integer as easy,
      count(*) filter (
        where mode = 'flashcards' and rating is null
      )::integer as unrated
    from answers
  )
  select jsonb_build_object(
    'tests', jsonb_build_object(
      'answers', test_answers,
      'correct', test_correct,
      'accuracy', case when test_answers = 0 then 0
        else round(test_correct * 100.0 / test_answers)::integer end
    ),
    'flashcards', jsonb_build_object(
      'answers', flashcard_answers,
      'again', again,
      'hard', hard,
      'good', good,
      'easy', easy,
      'unrated', unrated
    )
  ) into result
  from assessment;

  return result;
end;
$$;

revoke all on function public.get_study_assessment(uuid, integer, text)
  from public, anon;
grant execute on function public.get_study_assessment(uuid, integer, text)
  to authenticated;
