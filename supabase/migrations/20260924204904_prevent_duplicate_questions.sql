alter table public.questions
  add column dedupe_key text;

create function private.normalize_question_duplicate_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(value, '')), '\s+', ' ', 'g')
  );
$$;

create function private.question_dedupe_key(
  question_content text,
  options jsonb
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'content', private.normalize_question_duplicate_text(question_content),
      'options', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            private.normalize_question_duplicate_text(option.value ->> 'content'),
            coalesce((option.value ->> 'isCorrect')::boolean, false)
          )
          order by
            private.normalize_question_duplicate_text(option.value ->> 'content'),
            coalesce((option.value ->> 'isCorrect')::boolean, false)
        )
        from pg_catalog.jsonb_array_elements(coalesce(options, '[]'::jsonb))
          as option(value)
      ), '[]'::jsonb)
    )::text
  );
$$;

-- Keep one indexed representative of every pre-existing duplicate group.
-- Legacy duplicates remain usable, but any new write colliding with the group
-- is rejected until the user removes or changes the duplicate.
with question_keys as (
  select
    question.id,
    question.user_id,
    question.module_id,
    question.trash_id,
    private.question_dedupe_key(
      question.content,
      coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'content', option.content,
            'isCorrect', option.is_correct
          )
          order by option.position, option.id
        )
        from public.question_options as option
        where option.question_id = question.id
      ), '[]'::jsonb)
    ) as dedupe_key
  from public.questions as question
), ranked_questions as (
  select
    id,
    dedupe_key,
    pg_catalog.row_number() over (
      partition by user_id, module_id, dedupe_key
      order by id
    ) as duplicate_rank
  from question_keys
  where trash_id is null
)
update public.questions as question
set dedupe_key = ranked.dedupe_key
from ranked_questions as ranked
where question.id = ranked.id
  and ranked.duplicate_rank = 1;

update public.questions as question
set dedupe_key = private.question_dedupe_key(
  question.content,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'content', option.content,
        'isCorrect', option.is_correct
      )
      order by option.position, option.id
    )
    from public.question_options as option
    where option.question_id = question.id
  ), '[]'::jsonb)
)
where question.trash_id is not null;

create unique index questions_active_dedupe_idx
  on public.questions (user_id, module_id, dedupe_key)
  where trash_id is null and dedupe_key is not null;

create function private.refresh_question_dedupe_key(target_question_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with candidate as (
    select
      question.id,
      private.question_dedupe_key(
        question.content,
        coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'content', option.content,
              'isCorrect', option.is_correct
            )
            order by option.position, option.id
          )
          from public.question_options as option
          where option.question_id = question.id
        ), '[]'::jsonb)
      ) as dedupe_key
    from public.questions as question
    where question.id = target_question_id
  )
  update public.questions as question
  set dedupe_key = candidate.dedupe_key
  from candidate
  where question.id = candidate.id
    and question.dedupe_key is distinct from candidate.dedupe_key;
$$;

create function private.refresh_question_dedupe_key_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_question_dedupe_key(old.question_id);
  elsif tg_op = 'UPDATE' then
    perform private.refresh_question_dedupe_key(old.question_id);
    if new.question_id is distinct from old.question_id then
      perform private.refresh_question_dedupe_key(new.question_id);
    end if;
  else
    perform private.refresh_question_dedupe_key(new.question_id);
  end if;
  return null;
end;
$$;

create function private.refresh_question_row_dedupe_key_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    perform private.refresh_question_dedupe_key(new.id);
  end if;
  return null;
end;
$$;

create constraint trigger refresh_question_dedupe_key_after_option_change
after insert or update or delete on public.question_options
deferrable initially deferred
for each row execute function private.refresh_question_dedupe_key_trigger();

create constraint trigger refresh_question_dedupe_key_after_question_change
after insert or update of content, module_id, trash_id, dedupe_key on public.questions
deferrable initially deferred
for each row execute function private.refresh_question_row_dedupe_key_trigger();

revoke all on function private.normalize_question_duplicate_text(text)
  from public, anon;
revoke all on function private.question_dedupe_key(text, jsonb)
  from public, anon;
grant execute on function private.normalize_question_duplicate_text(text)
  to authenticated;
grant execute on function private.question_dedupe_key(text, jsonb)
  to authenticated;
revoke all on function private.refresh_question_dedupe_key(uuid)
  from public, anon, authenticated;
revoke all on function private.refresh_question_dedupe_key_trigger()
  from public, anon, authenticated;
revoke all on function private.refresh_question_row_dedupe_key_trigger()
  from public, anon, authenticated;

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
  owner_id uuid := (select auth.uid());
  saved_id uuid := coalesce(question_id, gen_random_uuid());
  option_count integer;
  correct_count integer;
  candidate_dedupe_key text;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1
    from public.modules
    where id = target_module_id
      and user_id = owner_id
      and trash_id is null
  ) then
    raise exception 'Nie znaleziono modułu.';
  end if;
  if pg_catalog.jsonb_typeof(options) is distinct from 'array' then
    raise exception 'Pytanie wymaga prawidłowej listy odpowiedzi.';
  end if;

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where coalesce((item ->> 'isCorrect')::boolean, false)
    )
  into option_count, correct_count
  from pg_catalog.jsonb_array_elements(options) as item;

  if pg_catalog.btrim(question_content) = ''
    or option_count < 1
    or correct_count <> 1
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(options) as item
      where pg_catalog.btrim(item ->> 'content') = ''
    )
  then
    raise exception 'Pytanie wymaga treści i dokładnie jednej poprawnej odpowiedzi.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(options) as item
    group by private.normalize_question_duplicate_text(item ->> 'content')
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Odpowiedzi nie mogą się powtarzać.';
  end if;

  if selected_topic_id is not null then
    select topic.chapter_id
    into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = selected_topic_id
      and topic.user_id = owner_id
      and topic.trash_id is null
      and chapter.module_id = target_module_id
      and chapter.trash_id is null;
    if selected_chapter_id is null then
      raise exception 'Nie znaleziono tematu w module.';
    end if;
  elsif selected_chapter_id is not null and not exists (
    select 1
    from public.chapters
    where id = selected_chapter_id
      and user_id = owner_id
      and module_id = target_module_id
      and trash_id is null
  ) then
    raise exception 'Nie znaleziono rozdziału w module.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );
  candidate_dedupe_key := private.question_dedupe_key(question_content, options);

  insert into public.questions (
    id,
    user_id,
    module_id,
    chapter_id,
    topic_id,
    content,
    explanation,
    dedupe_key
  ) values (
    saved_id,
    owner_id,
    target_module_id,
    selected_chapter_id,
    selected_topic_id,
    pg_catalog.btrim(question_content),
    nullif(pg_catalog.btrim(question_explanation), ''),
    candidate_dedupe_key
  )
  on conflict (id) do update set
    module_id = excluded.module_id,
    chapter_id = excluded.chapter_id,
    topic_id = excluded.topic_id,
    content = excluded.content,
    explanation = excluded.explanation,
    dedupe_key = excluded.dedupe_key,
    updated_at = pg_catalog.now()
  where questions.user_id = owner_id
    and questions.module_id = target_module_id
    and questions.trash_id is null;

  if not found then
    raise exception 'Nie znaleziono pytania.';
  end if;

  delete from public.question_options
  where question_options.question_id = saved_id
    and user_id = owner_id;

  insert into public.question_options (
    user_id,
    question_id,
    content,
    is_correct,
    position
  )
  select
    owner_id,
    saved_id,
    pg_catalog.btrim(item ->> 'content'),
    (item ->> 'isCorrect')::boolean,
    ordinality::integer
  from pg_catalog.jsonb_array_elements(options)
    with ordinality as source(item, ordinality);

  return saved_id;
end;
$$;

create function public.get_question_duplicate_status(
  target_module_id uuid,
  excluded_question_id uuid,
  question_content text,
  options jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with candidate as (
    select
      private.normalize_question_duplicate_text(question_content) as normalized_content,
      private.question_dedupe_key(question_content, options) as dedupe_key
  )
  select pg_catalog.jsonb_build_object(
    'kind', case
      when question.dedupe_key = candidate.dedupe_key then 'exact'
      else 'same_content'
    end,
    'questionId', question.id
  )
  from public.questions as question
  cross join candidate
  where question.user_id = (select auth.uid())
    and question.module_id = target_module_id
    and question.trash_id is null
    and question.id is distinct from excluded_question_id
    and private.normalize_question_duplicate_text(question.content)
      = candidate.normalized_content
  order by (question.dedupe_key = candidate.dedupe_key) desc nulls last,
    question.created_at,
    question.id
  limit 1;
$$;

revoke all on function public.get_question_duplicate_status(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.get_question_duplicate_status(uuid, uuid, text, jsonb)
  to authenticated;

create or replace function public.import_questions_into_module(
  target_module_id uuid,
  imported_questions jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  question_id uuid;
  imported_question jsonb;
  imported_option jsonb;
  option_record record;
  option_count integer;
  correct_option_count integer;
  distinct_option_count integer;
  chapter_title text;
  topic_title text;
  base_slug text;
  candidate_slug text;
  slug_suffix integer;
  next_position bigint;
  imported_chapter_id uuid;
  imported_topic_id uuid;
  candidate_dedupe_key text;
  imported_count integer := 0;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1
    from public.modules
    where id = target_module_id
      and user_id = owner_id
      and trash_id is null
  ) then
    raise exception 'Moduł nie istnieje lub jest niedostępny.';
  end if;
  if pg_catalog.jsonb_typeof(imported_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(imported_questions) < 1
    or pg_catalog.jsonb_array_length(imported_questions) > 2000
  then
    raise exception 'Import musi zawierać od 1 do 2000 pytań.';
  end if;

  for imported_question in
    select value from pg_catalog.jsonb_array_elements(imported_questions)
  loop
    if pg_catalog.jsonb_typeof(imported_question) is distinct from 'object'
      or pg_catalog.btrim(coalesce(imported_question ->> 'content', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(imported_question ->> 'content')) > 10000
      or pg_catalog.length(pg_catalog.btrim(coalesce(imported_question ->> 'explanation', ''))) > 20000
      or pg_catalog.jsonb_typeof(imported_question -> 'options') is distinct from 'array'
    then
      raise exception 'Każde pytanie wymaga treści do 10000 znaków i prawidłowej listy odpowiedzi.';
    end if;

    if (imported_question ? 'chapterTitle'
        and pg_catalog.jsonb_typeof(imported_question -> 'chapterTitle') not in ('string', 'null'))
      or (imported_question ? 'topicTitle'
        and pg_catalog.jsonb_typeof(imported_question -> 'topicTitle') not in ('string', 'null'))
      or (imported_question ? 'chapterSlug'
        and pg_catalog.jsonb_typeof(imported_question -> 'chapterSlug') not in ('string', 'null'))
      or (imported_question ? 'topicSlug'
        and pg_catalog.jsonb_typeof(imported_question -> 'topicSlug') not in ('string', 'null'))
    then
      raise exception 'Nieprawidłowa hierarchia talii Anki.';
    end if;

    chapter_title := nullif(pg_catalog.btrim(imported_question ->> 'chapterTitle'), '');
    topic_title := nullif(pg_catalog.btrim(imported_question ->> 'topicTitle'), '');
    if pg_catalog.length(coalesce(chapter_title, '')) > 10000
      or pg_catalog.length(coalesce(topic_title, '')) > 10000
      or (topic_title is not null and chapter_title is null)
      or (chapter_title is not null and (
        pg_catalog.btrim(coalesce(imported_question ->> 'chapterSlug', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(imported_question ->> 'chapterSlug')) > 500
      ))
      or (topic_title is not null and (
        pg_catalog.btrim(coalesce(imported_question ->> 'topicSlug', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(imported_question ->> 'topicSlug')) > 500
      ))
    then
      raise exception 'Nieprawidłowa hierarchia talii Anki.';
    end if;

    option_count := pg_catalog.jsonb_array_length(imported_question -> 'options');
    if option_count < 1 or option_count > 20 then
      raise exception 'Pytanie musi mieć od 1 do 20 odpowiedzi.';
    end if;

    correct_option_count := 0;
    for imported_option in
      select value from pg_catalog.jsonb_array_elements(imported_question -> 'options')
    loop
      if pg_catalog.jsonb_typeof(imported_option) is distinct from 'object'
        or pg_catalog.btrim(coalesce(imported_option ->> 'content', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(imported_option ->> 'content')) > 10000
        or pg_catalog.jsonb_typeof(imported_option -> 'isCorrect') is distinct from 'boolean'
      then
        raise exception 'Każda odpowiedź wymaga treści do 10000 znaków i informacji, czy jest poprawna.';
      end if;
      if (imported_option ->> 'isCorrect')::boolean then
        correct_option_count := correct_option_count + 1;
      end if;
    end loop;

    if correct_option_count <> 1 then
      raise exception 'Pytanie musi mieć dokładnie jedną poprawną odpowiedź.';
    end if;

    select pg_catalog.count(
      distinct private.normalize_question_duplicate_text(value ->> 'content')
    )
    into distinct_option_count
    from pg_catalog.jsonb_array_elements(imported_question -> 'options');
    if distinct_option_count <> option_count then
      raise exception 'Odpowiedzi w pytaniu nie mogą się powtarzać.';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );

  for imported_question in
    select value from pg_catalog.jsonb_array_elements(imported_questions)
  loop
    candidate_dedupe_key := private.question_dedupe_key(
      imported_question ->> 'content',
      imported_question -> 'options'
    );
    if exists (
      select 1
      from public.questions as existing_question
      where existing_question.user_id = owner_id
        and existing_question.module_id = target_module_id
        and existing_question.trash_id is null
        and existing_question.dedupe_key = candidate_dedupe_key
    ) then
      continue;
    end if;

    chapter_title := nullif(pg_catalog.btrim(imported_question ->> 'chapterTitle'), '');
    topic_title := nullif(pg_catalog.btrim(imported_question ->> 'topicTitle'), '');
    imported_chapter_id := null;
    imported_topic_id := null;

    if chapter_title is not null then
      select chapter.id
      into imported_chapter_id
      from public.chapters as chapter
      where chapter.module_id = target_module_id
        and chapter.user_id = owner_id
        and chapter.trash_id is null
        and private.normalize_question_duplicate_text(chapter.title)
          = private.normalize_question_duplicate_text(chapter_title)
      order by chapter.position, chapter.id
      limit 1;

      if imported_chapter_id is null then
        base_slug := pg_catalog.btrim(imported_question ->> 'chapterSlug');
        candidate_slug := base_slug;
        slug_suffix := 2;
        while exists (
          select 1
          from public.chapters
          where module_id = target_module_id
            and trash_id is null
            and slug = candidate_slug
        ) loop
          candidate_slug := pg_catalog.left(base_slug, 480 - pg_catalog.length(slug_suffix::text))
            || '-' || slug_suffix;
          slug_suffix := slug_suffix + 1;
        end loop;
        select coalesce(pg_catalog.max(position), 0) + 1000
        into next_position
        from public.chapters
        where module_id = target_module_id
          and user_id = owner_id
          and trash_id is null;
        insert into public.chapters (user_id, module_id, slug, title, position)
        values (owner_id, target_module_id, candidate_slug, chapter_title, next_position)
        returning id into imported_chapter_id;
      end if;
    end if;

    if topic_title is not null then
      select topic.id
      into imported_topic_id
      from public.topics as topic
      where topic.chapter_id = imported_chapter_id
        and topic.user_id = owner_id
        and topic.trash_id is null
        and private.normalize_question_duplicate_text(topic.title)
          = private.normalize_question_duplicate_text(topic_title)
      order by topic.position, topic.id
      limit 1;

      if imported_topic_id is null then
        base_slug := pg_catalog.btrim(imported_question ->> 'topicSlug');
        candidate_slug := base_slug;
        slug_suffix := 2;
        while exists (
          select 1
          from public.topics
          where chapter_id = imported_chapter_id
            and trash_id is null
            and slug = candidate_slug
        ) loop
          candidate_slug := pg_catalog.left(base_slug, 480 - pg_catalog.length(slug_suffix::text))
            || '-' || slug_suffix;
          slug_suffix := slug_suffix + 1;
        end loop;
        select coalesce(pg_catalog.max(position), 0) + 1000
        into next_position
        from public.topics
        where chapter_id = imported_chapter_id
          and user_id = owner_id
          and trash_id is null;
        insert into public.topics (user_id, chapter_id, slug, title, position)
        values (owner_id, imported_chapter_id, candidate_slug, topic_title, next_position)
        returning id into imported_topic_id;
      end if;
    end if;

    question_id := gen_random_uuid();
    insert into public.questions (
      id,
      user_id,
      module_id,
      chapter_id,
      topic_id,
      content,
      explanation,
      dedupe_key
    ) values (
      question_id,
      owner_id,
      target_module_id,
      imported_chapter_id,
      imported_topic_id,
      pg_catalog.btrim(imported_question ->> 'content'),
      nullif(pg_catalog.btrim(imported_question ->> 'explanation'), ''),
      candidate_dedupe_key
    )
    on conflict (user_id, module_id, dedupe_key)
      where trash_id is null and dedupe_key is not null
      do nothing;

    if not found then
      continue;
    end if;

    for option_record in
      select value, ordinality
      from pg_catalog.jsonb_array_elements(imported_question -> 'options')
        with ordinality
    loop
      insert into public.question_options (
        user_id,
        question_id,
        content,
        is_correct,
        position
      ) values (
        owner_id,
        question_id,
        pg_catalog.btrim(option_record.value ->> 'content'),
        (option_record.value ->> 'isCorrect')::boolean,
        option_record.ordinality
      );
    end loop;
    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;
