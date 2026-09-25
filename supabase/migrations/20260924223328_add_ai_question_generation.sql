create table public.ai_question_generation_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null,
  topic_id uuid not null,
  source_hash text not null,
  question_count smallint not null,
  model text not null,
  prompt_version integer not null,
  proposals jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_question_generation_cache_module_owner_fkey
    foreign key (module_id, user_id)
    references public.modules(id, user_id) on delete cascade,
  constraint ai_question_generation_cache_topic_owner_fkey
    foreign key (topic_id, user_id)
    references public.topics(id, user_id) on delete cascade,
  constraint ai_question_generation_cache_source_hash_check
    check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_question_generation_cache_question_count_check
    check (question_count between 1 and 10),
  constraint ai_question_generation_cache_model_check
    check (pg_catalog.length(pg_catalog.btrim(model)) between 1 and 100),
  constraint ai_question_generation_cache_prompt_version_check
    check (prompt_version > 0),
  constraint ai_question_generation_cache_proposals_check
    check (pg_catalog.jsonb_typeof(proposals) = 'array'),
  constraint ai_question_generation_cache_user_topic_key
    unique (user_id, topic_id)
);

create index ai_question_generation_cache_module_owner_idx
  on public.ai_question_generation_cache (module_id, user_id);
create index ai_question_generation_cache_topic_owner_idx
  on public.ai_question_generation_cache (topic_id, user_id);

alter table public.ai_question_generation_cache enable row level security;

revoke all on table public.ai_question_generation_cache from anon, authenticated;
grant select, insert, update, delete
  on table public.ai_question_generation_cache to authenticated;

create policy "Users select own AI question cache"
  on public.ai_question_generation_cache for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own AI question cache"
  on public.ai_question_generation_cache for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own AI question cache"
  on public.ai_question_generation_cache for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own AI question cache"
  on public.ai_question_generation_cache for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.get_ai_question_generation_topics(
  target_module_id uuid,
  selected_topic_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  requested_count integer;
  result jsonb;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1 from public.modules
    where id = target_module_id
      and user_id = owner_id
      and trash_id is null
  ) then
    raise exception 'Moduł nie istnieje lub jest niedostępny.';
  end if;

  requested_count := coalesce(pg_catalog.cardinality(selected_topic_ids), 0);
  if requested_count < 1 or requested_count > 50
    or (
      select pg_catalog.count(distinct topic_id)
      from pg_catalog.unnest(selected_topic_ids) as topic_id
    ) <> requested_count
  then
    raise exception 'Wybierz od 1 do 50 różnych tematów.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', topic.id,
        'title', topic.title,
        'content', topic.content,
        'chapterId', chapter.id,
        'chapterTitle', chapter.title
      ) order by chapter.position, chapter.id, topic.position, topic.id
    ),
    '[]'::jsonb
  )
  into result
  from public.topics as topic
  join public.chapters as chapter
    on chapter.id = topic.chapter_id
    and chapter.user_id = owner_id
    and chapter.module_id = target_module_id
    and chapter.trash_id is null
  where topic.user_id = owner_id
    and topic.trash_id is null
    and topic.id = any(selected_topic_ids);

  if pg_catalog.jsonb_array_length(result) <> requested_count then
    raise exception 'Co najmniej jeden temat nie istnieje lub jest niedostępny.';
  end if;
  return result;
end;
$$;

revoke all on function public.get_ai_question_generation_topics(uuid, uuid[])
  from public, anon;
grant execute on function public.get_ai_question_generation_topics(uuid, uuid[])
  to authenticated;

create function public.approve_ai_generated_questions(
  target_module_id uuid,
  generated_questions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  generated_question jsonb;
  generated_option jsonb;
  option_record record;
  saved_question_id uuid;
  selected_topic_id uuid;
  selected_chapter_id uuid;
  option_count integer;
  correct_option_count integer;
  distinct_option_count integer;
  candidate_dedupe_key text;
  created_count integer := 0;
  skipped_count integer := 0;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1 from public.modules
    where id = target_module_id
      and user_id = owner_id
      and trash_id is null
  ) then
    raise exception 'Moduł nie istnieje lub jest niedostępny.';
  end if;
  if pg_catalog.jsonb_typeof(generated_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(generated_questions) < 1
    or pg_catalog.jsonb_array_length(generated_questions) > 500
  then
    raise exception 'Można zatwierdzić od 1 do 500 pytań jednocześnie.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );

  for generated_question in
    select value from pg_catalog.jsonb_array_elements(generated_questions)
  loop
    if pg_catalog.jsonb_typeof(generated_question) is distinct from 'object'
      or pg_catalog.jsonb_typeof(generated_question -> 'topicId') is distinct from 'string'
      or pg_catalog.btrim(coalesce(generated_question ->> 'content', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(generated_question ->> 'content')) > 10000
      or pg_catalog.length(pg_catalog.btrim(coalesce(generated_question ->> 'explanation', ''))) > 20000
      or pg_catalog.jsonb_typeof(generated_question -> 'options') is distinct from 'array'
    then
      raise exception 'Nieprawidłowe pytanie wygenerowane przez AI.';
    end if;

    begin
      selected_topic_id := (generated_question ->> 'topicId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Nieprawidłowy identyfikator tematu.';
    end;

    select chapter.id
      into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = owner_id
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
    where topic.id = selected_topic_id
      and topic.user_id = owner_id
      and topic.trash_id is null;
    if selected_chapter_id is null then
      raise exception 'Temat pytania nie istnieje lub jest niedostępny.';
    end if;

    option_count := pg_catalog.jsonb_array_length(generated_question -> 'options');
    if option_count < 1 or option_count > 20 then
      raise exception 'Pytanie musi mieć od 1 do 20 odpowiedzi.';
    end if;

    correct_option_count := 0;
    for generated_option in
      select value
      from pg_catalog.jsonb_array_elements(generated_question -> 'options')
    loop
      if pg_catalog.jsonb_typeof(generated_option) is distinct from 'object'
        or pg_catalog.btrim(coalesce(generated_option ->> 'content', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(generated_option ->> 'content')) > 10000
        or pg_catalog.jsonb_typeof(generated_option -> 'isCorrect') is distinct from 'boolean'
      then
        raise exception 'Nieprawidłowa odpowiedź w pytaniu wygenerowanym przez AI.';
      end if;
      if (generated_option ->> 'isCorrect')::boolean then
        correct_option_count := correct_option_count + 1;
      end if;
    end loop;
    if correct_option_count <> 1 then
      raise exception 'Pytanie musi mieć dokładnie jedną poprawną odpowiedź.';
    end if;

    select pg_catalog.count(distinct private.normalize_question_duplicate_text(value ->> 'content'))
      into distinct_option_count
    from pg_catalog.jsonb_array_elements(generated_question -> 'options');
    if distinct_option_count <> option_count then
      raise exception 'Odpowiedzi w pytaniu nie mogą się powtarzać.';
    end if;

    candidate_dedupe_key := private.question_dedupe_key(
      generated_question ->> 'content',
      generated_question -> 'options'
    );
    if exists (
      select 1 from public.questions
      where user_id = owner_id
        and module_id = target_module_id
        and trash_id is null
        and dedupe_key = candidate_dedupe_key
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    begin
      insert into public.questions (
        user_id, module_id, chapter_id, topic_id,
        content, explanation, dedupe_key
      ) values (
        owner_id, target_module_id, selected_chapter_id, selected_topic_id,
        pg_catalog.btrim(generated_question ->> 'content'),
        nullif(pg_catalog.btrim(generated_question ->> 'explanation'), ''),
        candidate_dedupe_key
      ) returning id into saved_question_id;

      for option_record in
        select value, ordinality
        from pg_catalog.jsonb_array_elements(generated_question -> 'options')
          with ordinality
      loop
        insert into public.question_options (
          user_id, question_id, content, is_correct, position
        ) values (
          owner_id,
          saved_question_id,
          pg_catalog.btrim(option_record.value ->> 'content'),
          (option_record.value ->> 'isCorrect')::boolean,
          option_record.ordinality
        );
      end loop;
      created_count := created_count + 1;
    exception when unique_violation then
      skipped_count := skipped_count + 1;
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'created', created_count,
    'duplicatesSkipped', skipped_count
  );
end;
$$;

revoke all on function public.approve_ai_generated_questions(uuid, jsonb)
  from public, anon;
grant execute on function public.approve_ai_generated_questions(uuid, jsonb)
  to authenticated;
