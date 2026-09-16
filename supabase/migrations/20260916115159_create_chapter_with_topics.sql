create function public.create_chapter_with_topics(
  target_module_id uuid,
  new_chapter jsonb,
  new_topics jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  chapter_id uuid;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = owner_id
      and module.trash_id is null
  ) then
    raise exception 'Nie znaleziono modułu.';
  end if;
  if jsonb_typeof(new_chapter) is distinct from 'object'
    or btrim(coalesce(new_chapter ->> 'title', '')) = ''
    or btrim(coalesce(new_chapter ->> 'slug', '')) = ''
  then
    raise exception 'Nieprawidłowy rozdział.';
  end if;
  if jsonb_typeof(new_topics) is distinct from 'array' then
    raise exception 'Nieprawidłowa lista tematów.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(new_topics) as topic(value)
    where btrim(coalesce(topic.value ->> 'title', '')) = ''
      or btrim(coalesce(topic.value ->> 'slug', '')) = ''
      or jsonb_typeof(topic.value -> 'content') is distinct from 'object'
  ) then
    raise exception 'Nieprawidłowy temat.';
  end if;

  insert into public.chapters (
    id,
    user_id,
    module_id,
    slug,
    title,
    position
  ) values (
    (new_chapter ->> 'id')::uuid,
    owner_id,
    target_module_id,
    new_chapter ->> 'slug',
    new_chapter ->> 'title',
    (new_chapter ->> 'position')::bigint
  ) returning id into chapter_id;

  insert into public.topics (
    id,
    user_id,
    chapter_id,
    slug,
    title,
    content,
    completed,
    position
  )
  select
    topic.id,
    owner_id,
    chapter_id,
    topic.slug,
    topic.title,
    topic.content,
    coalesce(topic.completed, false),
    topic.position
  from jsonb_to_recordset(new_topics) as topic(
    id uuid,
    slug text,
    title text,
    content jsonb,
    completed boolean,
    position bigint
  );
end;
$$;

revoke all on function public.create_chapter_with_topics(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_chapter_with_topics(uuid, jsonb, jsonb)
  to authenticated;
