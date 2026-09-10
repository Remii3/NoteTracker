alter table public.modules add column slug text default '';

create function public.set_module_slug()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix integer;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  base_slug := trim(both '-' from regexp_replace(
    translate(lower(btrim(new.name)), 'ąćęłńóśźż', 'acelnoszz'),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  if base_slug = '' then
    base_slug := 'modul';
  end if;

  candidate_slug := base_slug;
  suffix := 2;
  while exists (
    select 1
    from public.modules as existing
    where existing.user_id = new.user_id
      and existing.id <> new.id
      and existing.slug = candidate_slug
      and existing.trash_id is null
  ) loop
    candidate_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  end loop;

  new.slug := candidate_slug;
  return new;
end;
$$;

revoke all on function public.set_module_slug() from public, anon, authenticated;

create trigger set_module_slug
before insert or update of slug on public.modules
for each row execute function public.set_module_slug();

do $$
declare
  target_id uuid;
begin
  for target_id in
    select id from public.modules order by user_id, created_at, id
  loop
    update public.modules set slug = null where id = target_id;
  end loop;
end;
$$;

alter table public.modules alter column slug set not null;
alter table public.modules
  add constraint modules_slug_check
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create unique index modules_user_slug_idx
  on public.modules (user_id, slug)
  where trash_id is null;

drop function public.get_module_summaries(uuid);

create function public.get_module_summaries(
  target_module_id uuid default null,
  target_module_slug text default null
)
returns table (
  id uuid,
  slug text,
  name text,
  module_position integer,
  chapters_count integer,
  completed_chapters_count integer,
  topics_count integer,
  completed_topics_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with chapter_progress as (
    select chapter.id, chapter.module_id,
      count(topic.id)::integer as topics_count,
      count(topic.id) filter (where topic.completed)::integer
        as completed_topics_count
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = chapter.user_id
      and topic.trash_id is null
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
    group by chapter.id, chapter.module_id
  )
  select module.id, module.slug, module.name,
    module.position as module_position,
    count(chapter.id)::integer as chapters_count,
    count(chapter.id) filter (
      where chapter.topics_count > 0
        and chapter.completed_topics_count = chapter.topics_count
    )::integer as completed_chapters_count,
    coalesce(sum(chapter.topics_count), 0)::integer as topics_count,
    coalesce(sum(chapter.completed_topics_count), 0)::integer
      as completed_topics_count
  from public.modules as module
  left join chapter_progress as chapter on chapter.module_id = module.id
  where module.user_id = (select auth.uid())
    and module.trash_id is null
    and (target_module_id is null or module.id = target_module_id)
    and (target_module_slug is null or module.slug = target_module_slug)
  group by module.id, module.slug, module.name, module.position
  order by module.position, module.id;
$$;

revoke all on function public.get_module_summaries(uuid, text)
  from public, anon;
grant execute on function public.get_module_summaries(uuid, text)
  to authenticated;
