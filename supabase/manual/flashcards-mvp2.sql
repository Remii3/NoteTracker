begin;

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  question text not null constraint flashcards_question_not_blank check (btrim(question) <> ''),
  answer text not null constraint flashcards_answer_not_blank check (btrim(answer) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flashcard_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('chapter', 'all', 'random_chapters', 'retry')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  configuration jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.flashcard_session_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.flashcard_sessions(id) on delete cascade,
  flashcard_id uuid references public.flashcards(id) on delete set null,
  position integer not null check (position > 0),
  question_snapshot text not null,
  answer_snapshot text not null,
  result text check (result is null or result in ('remembered', 'forgotten')),
  answered_at timestamptz,
  unique (session_id, position)
);

create index flashcards_user_topic_idx on public.flashcards (user_id, topic_id);
create index flashcard_sessions_user_started_idx on public.flashcard_sessions (user_id, started_at desc);
create index flashcard_session_items_user_session_position_idx on public.flashcard_session_items (user_id, session_id, position);

alter table public.flashcards enable row level security;
alter table public.flashcard_sessions enable row level security;
alter table public.flashcard_session_items enable row level security;

revoke all on table public.flashcards, public.flashcard_sessions, public.flashcard_session_items from anon, authenticated;
grant select, insert, update, delete on table public.flashcards, public.flashcard_sessions, public.flashcard_session_items to authenticated;

create policy "Users select own flashcards" on public.flashcards for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users insert own flashcards" on public.flashcards for insert to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (
    select 1 from public.topics
    where topics.id = topic_id and topics.user_id = (select auth.uid())
  )
);
create policy "Users update own flashcards" on public.flashcards for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.topics
    where topics.id = topic_id and topics.user_id = (select auth.uid())
  )
);
create policy "Users delete own flashcards" on public.flashcards for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users select own flashcard sessions" on public.flashcard_sessions for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users insert own flashcard sessions" on public.flashcard_sessions for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users update own flashcard sessions" on public.flashcard_sessions for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users delete own flashcard sessions" on public.flashcard_sessions for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users select own flashcard session items" on public.flashcard_session_items for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "Users insert own flashcard session items" on public.flashcard_session_items for insert to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (
    select 1 from public.flashcard_sessions
    where flashcard_sessions.id = session_id
      and flashcard_sessions.user_id = (select auth.uid())
  )
);
create policy "Users update own flashcard session items" on public.flashcard_session_items for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users delete own flashcard session items" on public.flashcard_session_items for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.create_flashcard_session(
  session_mode text,
  selected_chapter_id uuid default null,
  random_chapter_count integer default 3,
  requested_card_count integer default 20
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_session_id uuid;
  inserted_count integer;
begin
  if session_mode not in ('chapter', 'all', 'random_chapters') then
    raise exception 'Nieprawidłowy tryb fiszek.';
  end if;
  if requested_card_count is not null and requested_card_count < 1 then
    raise exception 'Liczba fiszek musi być większa od zera.';
  end if;
  if session_mode = 'chapter' and not exists (
    select 1 from public.chapters
    where id = selected_chapter_id and user_id = (select auth.uid())
  ) then
    raise exception 'Nie znaleziono rozdziału.';
  end if;

  insert into public.flashcard_sessions (user_id, mode, configuration)
  values (
    (select auth.uid()),
    session_mode,
    jsonb_build_object(
      'chapterId', selected_chapter_id,
      'randomChapterCount', random_chapter_count,
      'cardCount', requested_card_count
    )
  )
  returning id into created_session_id;

  with random_chapters as materialized (
    select chapter.id
    from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and exists (
        select 1
        from public.topics as topic
        join public.flashcards as flashcard on flashcard.topic_id = topic.id
        where topic.chapter_id = chapter.id
          and flashcard.user_id = (select auth.uid())
      )
    order by random()
    limit greatest(1, random_chapter_count)
  ),
  candidates as (
    select flashcard.id, flashcard.question, flashcard.answer
    from public.flashcards as flashcard
    join public.topics as topic on topic.id = flashcard.topic_id
    where flashcard.user_id = (select auth.uid())
      and topic.user_id = (select auth.uid())
      and (
        session_mode = 'all'
        or (session_mode = 'chapter' and topic.chapter_id = selected_chapter_id)
        or (session_mode = 'random_chapters' and topic.chapter_id in (select id from random_chapters))
      )
    order by random()
    limit requested_card_count
  )
  insert into public.flashcard_session_items (
    user_id, session_id, flashcard_id, position, question_snapshot, answer_snapshot
  )
  select
    (select auth.uid()), created_session_id, id,
    row_number() over ()::integer, question, answer
  from candidates;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.flashcard_sessions where id = created_session_id;
    raise exception 'Brak fiszek dla wybranego trybu.';
  end if;
  return created_session_id;
end;
$$;

create or replace function public.retry_flashcard_session(source_session_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_session_id uuid;
begin
  if not exists (
    select 1 from public.flashcard_sessions
    where id = source_session_id and user_id = (select auth.uid())
  ) then
    raise exception 'Nie znaleziono sesji.';
  end if;

  insert into public.flashcard_sessions (user_id, mode, configuration)
  values ((select auth.uid()), 'retry', jsonb_build_object('sourceSessionId', source_session_id))
  returning id into created_session_id;

  insert into public.flashcard_session_items (
    user_id, session_id, flashcard_id, position, question_snapshot, answer_snapshot
  )
  select
    (select auth.uid()), created_session_id, flashcard_id,
    row_number() over (order by position)::integer,
    question_snapshot, answer_snapshot
  from public.flashcard_session_items
  where session_id = source_session_id
    and user_id = (select auth.uid())
    and result = 'forgotten';

  if not found then
    delete from public.flashcard_sessions where id = created_session_id;
    raise exception 'Brak fiszek do powtórzenia.';
  end if;
  return created_session_id;
end;
$$;

revoke all on function public.create_flashcard_session(text, uuid, integer, integer) from public;
revoke all on function public.retry_flashcard_session(uuid) from public;
grant execute on function public.create_flashcard_session(text, uuid, integer, integer) to authenticated;
grant execute on function public.retry_flashcard_session(uuid) to authenticated;

commit;
