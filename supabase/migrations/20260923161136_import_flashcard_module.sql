create function public.import_question_module(
  target_name text,
  target_position bigint,
  imported_questions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  module_id uuid;
  question_id uuid;
  imported_question jsonb;
  imported_option jsonb;
  option_record record;
  option_count integer;
  correct_option_count integer;
  distinct_option_count integer;
  base_name text := pg_catalog.regexp_replace(pg_catalog.btrim(target_name), '\s+', ' ', 'g');
  candidate_name text;
  suffix integer := 2;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if base_name = '' or pg_catalog.length(base_name) > 120 then
    raise exception 'Nieprawidłowa nazwa modułu.';
  end if;
  if target_position <= 0 then
    raise exception 'Nieprawidłowa pozycja modułu.';
  end if;
  if pg_catalog.jsonb_typeof(imported_questions) is distinct from 'array' then
    raise exception 'Nieprawidłowa struktura importu pytań.';
  end if;
  if pg_catalog.jsonb_array_length(imported_questions) < 1
    or pg_catalog.jsonb_array_length(imported_questions) > 2000
  then
    raise exception 'Import musi zawierać od 1 do 2000 pytań.';
  end if;

  -- Validate everything before creating the module. A later error would also
  -- roll the transaction back, but rejecting early avoids unnecessary writes.
  for imported_question in
    select value from pg_catalog.jsonb_array_elements(imported_questions)
  loop
    if pg_catalog.jsonb_typeof(imported_question) is distinct from 'object'
      or pg_catalog.btrim(coalesce(imported_question ->> 'content', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(coalesce(imported_question ->> 'content', ''))) > 10000
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
        or pg_catalog.length(pg_catalog.btrim(coalesce(imported_option ->> 'content', ''))) > 10000
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

    select pg_catalog.count(distinct pg_catalog.lower(pg_catalog.btrim(value ->> 'content')))
      into distinct_option_count
    from pg_catalog.jsonb_array_elements(imported_question -> 'options');
    if distinct_option_count <> option_count then
      raise exception 'Odpowiedzi w pytaniu nie mogą się powtarzać.';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text, 0)
  );
  candidate_name := base_name;
  while exists (
    select 1
    from public.modules as existing
    where existing.user_id = owner_id
      and existing.trash_id is null
      and pg_catalog.lower(pg_catalog.btrim(existing.name)) = pg_catalog.lower(candidate_name)
  ) loop
    candidate_name := pg_catalog.left(base_name, 117 - pg_catalog.length(suffix::text))
      || ' (' || suffix || ')';
    suffix := suffix + 1;
  end loop;

  insert into public.modules (user_id, name, position)
  values (owner_id, candidate_name, target_position)
  returning id into module_id;

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
      module_id,
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

  return module_id;
end;
$$;

revoke all on function public.import_question_module(text, bigint, jsonb)
  from public, anon;
grant execute on function public.import_question_module(text, bigint, jsonb)
  to authenticated;
