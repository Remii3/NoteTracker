create function public.import_flashcard_module(
  target_name text,
  target_position bigint,
  imported_cards jsonb
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
  card jsonb;
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
  if pg_catalog.jsonb_typeof(imported_cards) is distinct from 'array' then
    raise exception 'Nieprawidłowa struktura importu fiszek.';
  end if;
  if pg_catalog.jsonb_array_length(imported_cards) < 1
    or pg_catalog.jsonb_array_length(imported_cards) > 2000
  then
    raise exception 'Import musi zawierać od 1 do 2000 fiszek.';
  end if;

  for card in select value from pg_catalog.jsonb_array_elements(imported_cards)
  loop
    if pg_catalog.btrim(coalesce(card ->> 'front', '')) = ''
      or pg_catalog.btrim(coalesce(card ->> 'back', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(card ->> 'front')) > 10000
      or pg_catalog.length(pg_catalog.btrim(card ->> 'back')) > 10000
    then
      raise exception 'Każda fiszka wymaga przodu i tyłu o długości do 10000 znaków.';
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

  for card in select value from pg_catalog.jsonb_array_elements(imported_cards)
  loop
    insert into public.questions (
      user_id,
      module_id,
      content
    ) values (
      owner_id,
      module_id,
      pg_catalog.btrim(card ->> 'front')
    ) returning id into question_id;

    insert into public.question_options (
      user_id,
      question_id,
      content,
      is_correct,
      position
    ) values (
      owner_id,
      question_id,
      pg_catalog.btrim(card ->> 'back'),
      true,
      1
    );
  end loop;

  return module_id;
end;
$$;

revoke all on function public.import_flashcard_module(text, bigint, jsonb)
  from public, anon;
grant execute on function public.import_flashcard_module(text, bigint, jsonb)
  to authenticated;
