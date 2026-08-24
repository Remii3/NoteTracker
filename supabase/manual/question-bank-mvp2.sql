begin;

drop function if exists public.retry_flashcard_session(uuid);
drop function if exists public.create_flashcard_session(text, uuid, integer, integer);
drop table if exists public.flashcard_session_items;
drop table if exists public.flashcard_sessions;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  content text not null constraint questions_content_not_blank check (btrim(content) <> ''),
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_explanation_not_blank check (explanation is null or btrim(explanation) <> '')
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  content text not null constraint question_options_content_not_blank check (btrim(content) <> ''),
  is_correct boolean not null default false,
  position integer not null check (position > 0),
  unique (question_id, position)
);

insert into public.questions (id, user_id, chapter_id, topic_id, content)
select flashcard.id, flashcard.user_id, topic.chapter_id, flashcard.topic_id, flashcard.question
from public.flashcards as flashcard
join public.topics as topic on topic.id = flashcard.topic_id;

insert into public.question_options (user_id, question_id, content, is_correct, position)
select user_id, id, answer, true, 1 from public.flashcards;

drop table public.flashcards;

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('flashcards', 'test')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  configuration jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.study_session_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  position integer not null check (position > 0),
  question_snapshot text not null,
  options_snapshot jsonb not null,
  explanation_snapshot text,
  selected_option_id uuid,
  result text check (result is null or result in ('remembered', 'forgotten', 'correct', 'incorrect')),
  answered_at timestamptz,
  unique (session_id, position)
);

create index questions_user_chapter_topic_idx on public.questions (user_id, chapter_id, topic_id);
create index questions_user_created_idx on public.questions (user_id, created_at desc);
create index question_options_user_question_position_idx on public.question_options (user_id, question_id, position);
create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at desc);
create index study_session_items_user_session_position_idx on public.study_session_items (user_id, session_id, position);

alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_session_items enable row level security;

revoke all on table public.questions, public.question_options, public.study_sessions, public.study_session_items from anon, authenticated;
grant select, insert, update, delete on table public.questions, public.question_options, public.study_sessions, public.study_session_items to authenticated;

create policy "Users manage own questions" on public.questions for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (chapter_id is null or exists (select 1 from public.chapters where id = chapter_id and user_id = (select auth.uid())))
  and (topic_id is null or exists (
    select 1 from public.topics
    where id = topic_id and user_id = (select auth.uid())
      and (chapter_id is null or topics.chapter_id = questions.chapter_id)
  ))
);
create policy "Users manage own question options" on public.question_options for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.questions where id = question_id and user_id = (select auth.uid()))
);
create policy "Users manage own study sessions" on public.study_sessions for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage own study session items" on public.study_session_items for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.study_sessions where id = session_id and user_id = (select auth.uid()))
);

create or replace function public.save_question(
  question_id uuid,
  question_content text,
  question_explanation text,
  selected_chapter_id uuid,
  selected_topic_id uuid,
  options jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid := coalesce(question_id, gen_random_uuid());
  option_count integer;
  correct_count integer;
begin
  select count(*), count(*) filter (where coalesce((item->>'isCorrect')::boolean, false))
  into option_count, correct_count
  from jsonb_array_elements(options) as item;
  if btrim(question_content) = '' or option_count < 1 or correct_count <> 1
    or exists (select 1 from jsonb_array_elements(options) item where btrim(item->>'content') = '') then
    raise exception 'Pytanie wymaga treści i dokładnie jednej poprawnej odpowiedzi.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(options) item
    group by lower(btrim(item->>'content')) having count(*) > 1
  ) then
    raise exception 'Odpowiedzi nie mogą się powtarzać.';
  end if;
  if selected_topic_id is not null then
    select topic.chapter_id into selected_chapter_id
    from public.topics as topic
    where topic.id = selected_topic_id and topic.user_id = (select auth.uid());
    if selected_chapter_id is null then raise exception 'Nie znaleziono tematu.'; end if;
  end if;

  insert into public.questions (id, user_id, chapter_id, topic_id, content, explanation)
  values (saved_id, (select auth.uid()), selected_chapter_id, selected_topic_id, btrim(question_content), nullif(btrim(question_explanation), ''))
  on conflict (id) do update set
    chapter_id = excluded.chapter_id,
    topic_id = excluded.topic_id,
    content = excluded.content,
    explanation = excluded.explanation,
    updated_at = now()
  where questions.user_id = (select auth.uid());

  delete from public.question_options where question_options.question_id = saved_id and user_id = (select auth.uid());
  insert into public.question_options (user_id, question_id, content, is_correct, position)
  select (select auth.uid()), saved_id, btrim(item->>'content'), (item->>'isCorrect')::boolean, ordinality::integer
  from jsonb_array_elements(options) with ordinality as source(item, ordinality);
  return saved_id;
end;
$$;

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
  if study_mode not in ('flashcards', 'test') or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned') then
    raise exception 'Nieprawidłowa konfiguracja sesji.';
  end if;
  insert into public.study_sessions (user_id, mode, configuration)
  values ((select auth.uid()), study_mode, jsonb_build_object('scope', scope_mode, 'chapterId', selected_chapter_id, 'topicId', selected_topic_id))
  returning id into created_id;

  with random_chapters as materialized (
    select id from public.chapters where user_id = (select auth.uid()) order by random() limit greatest(1, random_chapter_count)
  ), candidates as (
    select question.id, question.content, question.explanation,
      jsonb_agg(jsonb_build_object('id', option.id, 'content', option.content, 'isCorrect', option.is_correct) order by option.position) as option_data,
      count(option.id) as option_count
    from public.questions as question
    join public.question_options as option on option.question_id = question.id and option.user_id = (select auth.uid())
    where question.user_id = (select auth.uid()) and (
      scope_mode = 'all'
      or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
      or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
      or (scope_mode = 'unassigned' and question.chapter_id is null and question.topic_id is null)
      or (scope_mode = 'random_chapters' and question.chapter_id in (select id from random_chapters))
    )
    group by question.id
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random()
    limit requested_question_count
  )
  insert into public.study_session_items (user_id, session_id, question_id, position, question_snapshot, options_snapshot, explanation_snapshot)
  select (select auth.uid()), created_id, id, row_number() over ()::integer, content, option_data, explanation from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;
  return created_id;
end;
$$;

revoke all on function public.save_question(uuid, text, text, uuid, uuid, jsonb) from public;
revoke all on function public.create_study_session(text, text, uuid, uuid, integer, integer) from public;
grant execute on function public.save_question(uuid, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_study_session(text, text, uuid, uuid, integer, integer) to authenticated;

commit;
