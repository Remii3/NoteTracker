begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists chapters_user_position_id_idx
  on public.chapters (user_id, position, id);

create index if not exists topics_user_chapter_position_id_idx
  on public.topics (user_id, chapter_id, position, id);

create index if not exists chapters_title_search_idx
  on public.chapters using gin (lower(title) extensions.gin_trgm_ops);

create index if not exists topics_title_search_idx
  on public.topics using gin (lower(title) extensions.gin_trgm_ops);

create index if not exists chapters_title_trgm_idx
  on public.chapters using gin (title extensions.gin_trgm_ops);

create index if not exists topics_title_trgm_idx
  on public.topics using gin (title extensions.gin_trgm_ops);

create or replace function public.get_learning_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with owned_chapters as (
    select id, position
    from public.chapters
    where user_id = (select auth.uid())
  ),
  owned_topics as (
    select topic.id, topic.chapter_id, topic.completed, topic.position
    from public.topics as topic
    join owned_chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
  ),
  next_topic as (
    select topic.id, topic.chapter_id
    from owned_topics as topic
    join owned_chapters as chapter on chapter.id = topic.chapter_id
    where not topic.completed
    order by chapter.position, chapter.id, topic.position, topic.id
    limit 1
  )
  select jsonb_build_object(
    'totalChapters', (select count(*) from owned_chapters),
    'totalTopics', (select count(*) from owned_topics),
    'completedTopics', (
      select count(*) from owned_topics where completed
    ),
    'completedChapters', (
      select count(*)
      from owned_chapters as chapter
      where exists (
        select 1 from owned_topics where chapter_id = chapter.id
      )
      and not exists (
        select 1 from owned_topics
        where chapter_id = chapter.id and not completed
      )
    ),
    'nextTopic', (
      select jsonb_build_object('id', id, 'chapterId', chapter_id)
      from next_topic
    )
  );
$$;

create or replace function public.reorder_chapters(chapter_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(chapter_ids) as requested(id)
    left join public.chapters as chapter
      on chapter.id = requested.id
      and chapter.user_id = (select auth.uid())
    where chapter.id is null
  ) then
    raise exception 'Nieprawidłowa lista rozdziałów.';
  end if;

  update public.chapters as chapter
  set position = requested.ordinality * 1000
  from unnest(chapter_ids) with ordinality as requested(id, ordinality)
  where chapter.id = requested.id
    and chapter.user_id = (select auth.uid());
end;
$$;

create or replace function public.reorder_topics(
  target_chapter_id uuid,
  topic_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.chapters
    where id = target_chapter_id
      and user_id = (select auth.uid())
  ) or exists (
    select 1
    from unnest(topic_ids) as requested(id)
    left join public.topics as topic
      on topic.id = requested.id
      and topic.chapter_id = target_chapter_id
      and topic.user_id = (select auth.uid())
    where topic.id is null
  ) then
    raise exception 'Nieprawidłowa lista tematów.';
  end if;

  update public.topics as topic
  set position = requested.ordinality * 1000
  from unnest(topic_ids) with ordinality as requested(id, ordinality)
  where topic.id = requested.id
    and topic.chapter_id = target_chapter_id
    and topic.user_id = (select auth.uid());
end;
$$;

create or replace function public.move_topic(
  moved_topic_id uuid,
  source_chapter_id uuid,
  target_chapter_id uuid,
  target_slug text,
  source_topic_ids uuid[],
  target_topic_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.topics
    where id = moved_topic_id
      and chapter_id = source_chapter_id
      and user_id = (select auth.uid())
  ) or not exists (
    select 1 from public.chapters
    where id = target_chapter_id
      and user_id = (select auth.uid())
  ) then
    raise exception 'Nie można przenieść tematu.';
  end if;

  update public.topics
  set chapter_id = target_chapter_id, slug = target_slug
  where id = moved_topic_id
    and chapter_id = source_chapter_id
    and user_id = (select auth.uid());

  update public.topics as topic
  set position = requested.ordinality * 1000
  from unnest(source_topic_ids) with ordinality as requested(id, ordinality)
  where topic.id = requested.id
    and topic.chapter_id = source_chapter_id
    and topic.user_id = (select auth.uid());

  update public.topics as topic
  set position = requested.ordinality * 1000
  from unnest(target_topic_ids) with ordinality as requested(id, ordinality)
  where topic.id = requested.id
    and topic.chapter_id = target_chapter_id
    and topic.user_id = (select auth.uid());
end;
$$;

revoke all on function public.reorder_chapters(uuid[]) from public;
revoke all on function public.get_learning_summary() from public;
revoke all on function public.reorder_topics(uuid, uuid[]) from public;
revoke all on function public.move_topic(uuid, uuid, uuid, text, uuid[], uuid[])
  from public;
grant execute on function public.reorder_chapters(uuid[]) to authenticated;
grant execute on function public.get_learning_summary() to authenticated;
grant execute on function public.reorder_topics(uuid, uuid[]) to authenticated;
grant execute on function public.move_topic(uuid, uuid, uuid, text, uuid[], uuid[])
  to authenticated;

commit;
