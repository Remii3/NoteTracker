create function public.import_docx_module(
  target_name text,
  target_position bigint,
  imported_chapters jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  module_id uuid;
  chapter_id uuid;
  chapter jsonb;
  topic jsonb;
  base_name text := regexp_replace(btrim(target_name), '\s+', ' ', 'g');
  candidate_name text;
  suffix integer := 2;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if base_name = '' or length(base_name) > 120 then
    raise exception 'Nieprawidłowa nazwa modułu.';
  end if;
  if target_position <= 0 then
    raise exception 'Nieprawidłowa pozycja modułu.';
  end if;
  if jsonb_typeof(imported_chapters) is distinct from 'array' then
    raise exception 'Nieprawidłowa struktura importu.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text, 0)
  );
  candidate_name := base_name;
  while exists (
    select 1
    from public.modules as existing
    where existing.user_id = owner_id
      and existing.trash_id is null
      and lower(btrim(existing.name)) = lower(candidate_name)
  ) loop
    candidate_name := left(base_name, 117 - length(suffix::text))
      || ' (' || suffix || ')';
    suffix := suffix + 1;
  end loop;

  insert into public.modules (user_id, name, position)
  values (owner_id, candidate_name, target_position)
  returning id into module_id;

  for chapter in select value from jsonb_array_elements(imported_chapters)
  loop
    if btrim(coalesce(chapter ->> 'title', '')) = ''
      or btrim(coalesce(chapter ->> 'slug', '')) = ''
      or jsonb_typeof(chapter -> 'topics') is distinct from 'array'
    then
      raise exception 'Nieprawidłowy rozdział w importowanym dokumencie.';
    end if;

    insert into public.chapters (
      user_id,
      module_id,
      slug,
      title,
      position
    ) values (
      owner_id,
      module_id,
      chapter ->> 'slug',
      chapter ->> 'title',
      (chapter ->> 'position')::bigint
    ) returning id into chapter_id;

    for topic in select value from jsonb_array_elements(chapter -> 'topics')
    loop
      if btrim(coalesce(topic ->> 'title', '')) = ''
        or btrim(coalesce(topic ->> 'slug', '')) = ''
        or jsonb_typeof(topic -> 'content') is distinct from 'object'
      then
        raise exception 'Nieprawidłowy temat w importowanym dokumencie.';
      end if;

      insert into public.topics (
        user_id,
        chapter_id,
        slug,
        title,
        content,
        position
      ) values (
        owner_id,
        chapter_id,
        topic ->> 'slug',
        topic ->> 'title',
        topic -> 'content',
        (topic ->> 'position')::bigint
      );
    end loop;
  end loop;

  return module_id;
end;
$$;

revoke all on function public.import_docx_module(text, bigint, jsonb)
  from public, anon;
grant execute on function public.import_docx_module(text, bigint, jsonb)
  to authenticated;
