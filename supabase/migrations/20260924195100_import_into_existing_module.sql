create function public.import_docx_into_module(
  target_module_id uuid,
  imported_chapters jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  new_chapter_id uuid;
  chapter jsonb;
  topic jsonb;
  topic_record record;
  chapter_record record;
  chapter_position bigint;
  base_slug text;
  candidate_slug text;
  suffix integer;
  topic_slug text;
  topic_suffix integer;
  topic_count integer := 0;
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
  if pg_catalog.jsonb_typeof(imported_chapters) is distinct from 'array'
    or pg_catalog.jsonb_array_length(imported_chapters) < 1
    or pg_catalog.jsonb_array_length(imported_chapters) > 500
  then
    raise exception 'Import musi zawierać od 1 do 500 rozdziałów.';
  end if;

  for chapter in
    select value from pg_catalog.jsonb_array_elements(imported_chapters)
  loop
    if pg_catalog.jsonb_typeof(chapter) is distinct from 'object'
      or pg_catalog.btrim(coalesce(chapter ->> 'title', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(chapter ->> 'title')) > 10000
      or pg_catalog.btrim(coalesce(chapter ->> 'slug', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(chapter ->> 'slug')) > 500
      or pg_catalog.jsonb_typeof(chapter -> 'topics') is distinct from 'array'
    then
      raise exception 'Nieprawidłowy rozdział w importowanym dokumencie.';
    end if;

    topic_count := topic_count + pg_catalog.jsonb_array_length(chapter -> 'topics');
    if topic_count > 5000 then
      raise exception 'Import może zawierać maksymalnie 5000 tematów.';
    end if;

    for topic in
      select value from pg_catalog.jsonb_array_elements(chapter -> 'topics')
    loop
      if pg_catalog.jsonb_typeof(topic) is distinct from 'object'
        or pg_catalog.btrim(coalesce(topic ->> 'title', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(topic ->> 'title')) > 10000
        or pg_catalog.btrim(coalesce(topic ->> 'slug', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(topic ->> 'slug')) > 500
        or pg_catalog.jsonb_typeof(topic -> 'content') is distinct from 'object'
      then
        raise exception 'Nieprawidłowy temat w importowanym dokumencie.';
      end if;
    end loop;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );
  select coalesce(pg_catalog.max(position), 0)
    into chapter_position
  from public.chapters
  where module_id = target_module_id
    and user_id = owner_id
    and trash_id is null;

  for chapter_record in
    select value, ordinality
    from pg_catalog.jsonb_array_elements(imported_chapters) with ordinality
  loop
    chapter_position := chapter_position + 1000;
    base_slug := pg_catalog.btrim(chapter_record.value ->> 'slug');
    candidate_slug := base_slug;
    suffix := 2;
    while exists (
      select 1
      from public.chapters
      where module_id = target_module_id
        and trash_id is null
        and slug = candidate_slug
    ) loop
      candidate_slug := pg_catalog.left(base_slug, 480 - pg_catalog.length(suffix::text))
        || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    insert into public.chapters (
      user_id,
      module_id,
      slug,
      title,
      position
    ) values (
      owner_id,
      target_module_id,
      candidate_slug,
      pg_catalog.btrim(chapter_record.value ->> 'title'),
      chapter_position
    ) returning id into new_chapter_id;

    for topic_record in
      select value, ordinality
      from pg_catalog.jsonb_array_elements(chapter_record.value -> 'topics')
        with ordinality
    loop
      base_slug := pg_catalog.btrim(topic_record.value ->> 'slug');
      topic_slug := base_slug;
      topic_suffix := 2;
      while exists (
        select 1
        from public.topics
        where topics.chapter_id = new_chapter_id
          and trash_id is null
          and slug = topic_slug
      ) loop
        topic_slug := pg_catalog.left(base_slug, 480 - pg_catalog.length(topic_suffix::text))
          || '-' || topic_suffix;
        topic_suffix := topic_suffix + 1;
      end loop;

      insert into public.topics (
        user_id,
        chapter_id,
        slug,
        title,
        content,
        position
      ) values (
        owner_id,
        new_chapter_id,
        topic_slug,
        pg_catalog.btrim(topic_record.value ->> 'title'),
        topic_record.value -> 'content',
        topic_record.ordinality * 1000
      );
    end loop;
  end loop;

  return pg_catalog.jsonb_array_length(imported_chapters);
end;
$$;

revoke all on function public.import_docx_into_module(uuid, jsonb)
  from public, anon;
grant execute on function public.import_docx_into_module(uuid, jsonb)
  to authenticated;

create function public.import_questions_into_module(
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
      distinct pg_catalog.lower(pg_catalog.btrim(value ->> 'content'))
    ) into distinct_option_count
    from pg_catalog.jsonb_array_elements(imported_question -> 'options');
    if distinct_option_count <> option_count then
      raise exception 'Odpowiedzi w pytaniu nie mogą się powtarzać.';
    end if;
  end loop;

  for imported_question in
    select value from pg_catalog.jsonb_array_elements(imported_questions)
  loop
    insert into public.questions (
      user_id,
      module_id,
      content,
      explanation
    ) values (
      owner_id,
      target_module_id,
      pg_catalog.btrim(imported_question ->> 'content'),
      nullif(pg_catalog.btrim(imported_question ->> 'explanation'), '')
    ) returning id into question_id;

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
  end loop;

  return pg_catalog.jsonb_array_length(imported_questions);
end;
$$;

revoke all on function public.import_questions_into_module(uuid, jsonb)
  from public, anon;
grant execute on function public.import_questions_into_module(uuid, jsonb)
  to authenticated;
