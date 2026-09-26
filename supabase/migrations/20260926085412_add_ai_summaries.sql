create table public.ai_summary_generation_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null,
  scope_hash text not null,
  source_hash text not null,
  summary_length text not null,
  model text not null,
  prompt_version integer not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_summary_generation_cache_module_owner_fkey
    foreign key (module_id, user_id)
    references public.modules(id, user_id) on delete cascade,
  constraint ai_summary_generation_cache_scope_hash_check
    check (scope_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_summary_generation_cache_source_hash_check
    check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_summary_generation_cache_length_check
    check (summary_length in ('short', 'standard', 'detailed')),
  constraint ai_summary_generation_cache_model_check
    check (pg_catalog.length(pg_catalog.btrim(model)) between 1 and 100),
  constraint ai_summary_generation_cache_prompt_version_check
    check (prompt_version > 0),
  constraint ai_summary_generation_cache_summary_check
    check (pg_catalog.jsonb_typeof(summary) = 'object'),
  constraint ai_summary_generation_cache_scope_key
    unique (user_id, module_id, scope_hash, summary_length)
);

create index ai_summary_generation_cache_module_owner_idx
  on public.ai_summary_generation_cache (module_id, user_id);

alter table public.ai_summary_generation_cache enable row level security;

revoke all on table public.ai_summary_generation_cache from anon, authenticated;
grant select, insert, update, delete
  on table public.ai_summary_generation_cache to authenticated;

create policy "Users select own AI summary cache"
  on public.ai_summary_generation_cache for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own AI summary cache"
  on public.ai_summary_generation_cache for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own AI summary cache"
  on public.ai_summary_generation_cache for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own AI summary cache"
  on public.ai_summary_generation_cache for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.save_ai_summary_note(
  target_module_id uuid,
  topic_title text,
  topic_content jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  summary_chapter_id uuid;
  summary_chapter_slug text;
  saved_topic_id uuid := gen_random_uuid();
  saved_topic_slug text;
  next_chapter_position bigint;
  next_topic_position bigint;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(topic_title, ''))) not between 1 and 160 then
    raise exception 'Nazwa tematu musi mieć od 1 do 160 znaków.';
  end if;
  if pg_catalog.jsonb_typeof(topic_content) is distinct from 'object'
    or topic_content ->> 'type' is distinct from 'doc'
    or pg_catalog.octet_length(topic_content::text) > 200000
  then
    raise exception 'Nieprawidłowa treść streszczenia.';
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );

  select id, slug
    into summary_chapter_id, summary_chapter_slug
  from public.chapters
  where module_id = target_module_id
    and user_id = owner_id
    and slug = 'streszczenia-ai'
    and trash_id is null
  limit 1;

  if summary_chapter_id is null then
    select coalesce(pg_catalog.max(position), 0) + 1000
      into next_chapter_position
    from public.chapters
    where module_id = target_module_id
      and user_id = owner_id
      and trash_id is null;

    insert into public.chapters (
      user_id, module_id, slug, title, position
    ) values (
      owner_id, target_module_id, 'streszczenia-ai', 'Streszczenia AI',
      next_chapter_position
    )
    returning id, slug into summary_chapter_id, summary_chapter_slug;
  end if;

  saved_topic_slug := 'streszczenie-' || pg_catalog.left(saved_topic_id::text, 8);
  select coalesce(pg_catalog.max(position), 0) + 1000
    into next_topic_position
  from public.topics
  where chapter_id = summary_chapter_id
    and user_id = owner_id
    and trash_id is null;

  insert into public.topics (
    id, user_id, chapter_id, slug, title, content, completed, position
  ) values (
    saved_topic_id, owner_id, summary_chapter_id, saved_topic_slug,
    pg_catalog.btrim(topic_title), topic_content, false, next_topic_position
  );

  return pg_catalog.jsonb_build_object(
    'chapterId', summary_chapter_id,
    'chapterSlug', summary_chapter_slug,
    'topicId', saved_topic_id,
    'topicSlug', saved_topic_slug
  );
end;
$$;

revoke all on function public.save_ai_summary_note(uuid, text, jsonb)
  from public, anon;
grant execute on function public.save_ai_summary_note(uuid, text, jsonb)
  to authenticated;
