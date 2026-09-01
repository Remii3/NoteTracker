begin;

alter table public.questions add column if not exists module_id uuid;
alter table public.study_sessions add column if not exists module_id uuid;

update public.questions as question
set module_id = coalesce(
  (select chapter.module_id from public.chapters as chapter where chapter.id = question.chapter_id),
  (
    select module.id
    from public.modules as module
    where module.user_id = question.user_id
    order by module.position, module.created_at
    limit 1
  )
)
where question.module_id is null;

update public.study_sessions as session
set module_id = (
  select module.id
  from public.modules as module
  where module.user_id = session.user_id
  order by module.position, module.created_at
  limit 1
)
where session.module_id is null;

alter table public.questions alter column module_id set not null;
alter table public.study_sessions alter column module_id set not null;

alter table public.questions
  add constraint questions_module_owner_fkey
  foreign key (module_id, user_id)
  references public.modules (id, user_id)
  on delete cascade;

alter table public.study_sessions
  add constraint study_sessions_module_owner_fkey
  foreign key (module_id, user_id)
  references public.modules (id, user_id)
  on delete cascade;

create index questions_user_module_created_idx
  on public.questions (user_id, module_id, created_at desc);
create index study_sessions_user_module_started_idx
  on public.study_sessions (user_id, module_id, started_at desc);

create unique index modules_user_normalized_name_idx
  on public.modules (user_id, lower(btrim(name)));

create or replace function public.delete_empty_module(target_module_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.chapters
    where module_id = target_module_id and user_id = (select auth.uid())
  ) then raise exception 'Można usunąć tylko pusty moduł.'; end if;
  delete from public.modules
  where id = target_module_id and user_id = (select auth.uid());
  if not found then raise exception 'Nie znaleziono modułu.'; end if;
end;
$$;

create or replace function public.reorder_modules(module_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if cardinality(module_ids) <> (
    select count(*) from public.modules where user_id = (select auth.uid())
  ) or exists (
    select 1 from unnest(module_ids) as candidate(id)
    left join public.modules as module on module.id = candidate.id
      and module.user_id = (select auth.uid())
    where module.id is null
  ) or (select count(distinct id) from unnest(module_ids) as item(id)) <> cardinality(module_ids)
  then raise exception 'Nieprawidłowa kolejność modułów.'; end if;

  update public.modules as module
  set position = ordered.position * 1000
  from unnest(module_ids) with ordinality as ordered(id, position)
  where module.id = ordered.id and module.user_id = (select auth.uid());
end;
$$;

create or replace function public.sync_chapter_questions_module()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.module_id is distinct from old.module_id then
    update public.questions
    set module_id = new.module_id, updated_at = now()
    where chapter_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_chapter_questions_module on public.chapters;
create trigger sync_chapter_questions_module
after update of module_id on public.chapters
for each row execute function public.sync_chapter_questions_module();

create or replace function public.get_question_bank_availability(
  target_module_id uuid,
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
      and question.module_id = target_module_id
      and (selected_chapter_id is null or question.chapter_id = selected_chapter_id)
      and (selected_topic_id is null or question.topic_id = selected_topic_id)
      and (not only_unassigned or (question.chapter_id is null and question.topic_id is null))
  ), option_counts as (
    select question.id, count(option.id) as option_count
    from owned_questions as question
    left join public.question_options as option
      on option.question_id = question.id and option.user_id = (select auth.uid())
    group by question.id
  )
  select jsonb_build_object(
    'flashcardsCount', count(*) filter (where option_count >= 1),
    'testQuestionsCount', count(*) filter (where option_count >= 2)
  ) from option_counts;
$$;

create or replace function public.save_question(
  target_module_id uuid,
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
  if not exists (
    select 1 from public.modules
    where id = target_module_id and user_id = (select auth.uid())
  ) then raise exception 'Nie znaleziono modułu.'; end if;

  select count(*), count(*) filter (where coalesce((item->>'isCorrect')::boolean, false))
  into option_count, correct_count from jsonb_array_elements(options) as item;
  if btrim(question_content) = '' or option_count < 1 or correct_count <> 1
    or exists (select 1 from jsonb_array_elements(options) item where btrim(item->>'content') = '')
  then raise exception 'Pytanie wymaga treści i dokładnie jednej poprawnej odpowiedzi.'; end if;
  if exists (
    select 1 from jsonb_array_elements(options) item
    group by lower(btrim(item->>'content')) having count(*) > 1
  ) then raise exception 'Odpowiedzi nie mogą się powtarzać.'; end if;

  if selected_topic_id is not null then
    select topic.chapter_id into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = selected_topic_id and topic.user_id = (select auth.uid())
      and chapter.module_id = target_module_id;
    if selected_chapter_id is null then raise exception 'Nie znaleziono tematu w module.'; end if;
  elsif selected_chapter_id is not null and not exists (
    select 1 from public.chapters
    where id = selected_chapter_id and user_id = (select auth.uid())
      and module_id = target_module_id
  ) then raise exception 'Nie znaleziono rozdziału w module.'; end if;

  insert into public.questions (id, user_id, module_id, chapter_id, topic_id, content, explanation)
  values (saved_id, (select auth.uid()), target_module_id, selected_chapter_id, selected_topic_id, btrim(question_content), nullif(btrim(question_explanation), ''))
  on conflict (id) do update set
    module_id = excluded.module_id, chapter_id = excluded.chapter_id,
    topic_id = excluded.topic_id, content = excluded.content,
    explanation = excluded.explanation, updated_at = now()
  where questions.user_id = (select auth.uid()) and questions.module_id = target_module_id;

  delete from public.question_options
  where question_options.question_id = saved_id and user_id = (select auth.uid());
  insert into public.question_options (user_id, question_id, content, is_correct, position)
  select (select auth.uid()), saved_id, btrim(item->>'content'),
    (item->>'isCorrect')::boolean, ordinality::integer
  from jsonb_array_elements(options) with ordinality as source(item, ordinality);
  return saved_id;
end;
$$;

create or replace function public.create_study_session(
  target_module_id uuid,
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
declare created_id uuid; inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
    or not exists (select 1 from public.modules where id = target_module_id and user_id = (select auth.uid()))
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, study_mode,
    jsonb_build_object('scope', scope_mode, 'chapterId', selected_chapter_id, 'topicId', selected_topic_id))
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id from public.chapters as chapter
    where chapter.user_id = (select auth.uid()) and chapter.module_id = target_module_id
      and exists (
        select 1 from public.questions as question
        join public.question_options as option on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id and question.user_id = (select auth.uid())
          and question.module_id = target_module_id
        group by question.id having study_mode = 'flashcards' or count(option.id) >= 2
      )
    order by random() limit greatest(1, random_chapter_count)
  ), candidates as (
    select question.id, question.content, question.explanation,
      jsonb_agg(jsonb_build_object('id', option.id, 'content', option.content, 'isCorrect', option.is_correct) order by option.position) as option_data
    from public.questions as question
    join public.question_options as option on option.question_id = question.id
      and option.user_id = (select auth.uid())
    where question.user_id = (select auth.uid()) and question.module_id = target_module_id and (
      scope_mode = 'all'
      or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
      or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
      or (scope_mode = 'unassigned' and question.chapter_id is null and question.topic_id is null)
      or (scope_mode = 'random_chapters' and question.chapter_id in (select id from random_chapters))
    )
    group by question.id
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random() limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items
    (user_id, session_id, question_id, position, question_snapshot, options_snapshot, explanation_snapshot)
  select (select auth.uid()), created_id, id, row_number() over ()::integer,
    content, option_data, explanation from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;
  return created_id;
end;
$$;

revoke all on function public.get_question_bank_availability(uuid, uuid, uuid, boolean) from public;
revoke all on function public.save_question(uuid, uuid, text, text, uuid, uuid, jsonb) from public;
revoke all on function public.create_study_session(uuid, text, text, uuid, uuid, integer, integer) from public;
grant execute on function public.get_question_bank_availability(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.save_question(uuid, uuid, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_study_session(uuid, text, text, uuid, uuid, integer, integer) to authenticated;
revoke all on function public.delete_empty_module(uuid) from public;
revoke all on function public.reorder_modules(uuid[]) from public;
grant execute on function public.delete_empty_module(uuid) to authenticated;
grant execute on function public.reorder_modules(uuid[]) to authenticated;

commit;
