-- Initial NoteTracker application schema, reconstructed and tested locally.
-- Apply to a NEW Supabase project only; existing projects need schema diff
-- and migration-history reconciliation before adopting this baseline.
-- auth.users, auth.uid(), auth.role() and API roles are supplied by Supabase.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.4 (Debian 18.4-1.pgdg13+1)
-- Dumped by pg_dump version 18.4 (Debian 18.4-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: get_trash_image_keys(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.get_trash_image_keys(target_trash_id uuid) RETURNS TABLE(storage_key text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare owner_id uuid; kind text; entity_id uuid;
begin
  select user_id, item_type, item_id into owner_id, kind, entity_id from public.trash_items where id = target_trash_id;
  if owner_id is null or ((select auth.uid()) is distinct from owner_id and (select auth.role()) <> 'service_role')
    then raise exception 'Nie znaleziono elementu w koszu.'; end if;
  return query select distinct i.storage_key from public.topic_images i
    join public.topics t on t.id = i.topic_id join public.chapters c on c.id = t.chapter_id
    where i.user_id = owner_id and (
      (kind = 'module' and c.module_id = entity_id) or (kind = 'chapter' and c.id = entity_id)
      or (kind = 'topic' and t.id = entity_id) or (kind = 'image' and i.id = entity_id));
end; $$;


--
-- Name: move_to_trash(text, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.move_to_trash(target_type text, target_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare owner_id uuid := (select auth.uid()); batch_id uuid; item_title text;
begin
  if target_type = 'module' then
    select name into item_title from public.modules where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'chapter' then
    select title into item_title from public.chapters where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'topic' then
    select title into item_title from public.topics where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'image' then
    select original_filename into item_title from public.topic_images where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'question' then
    select left(content, 120) into item_title from public.questions where id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'study_session' then
    select 'Sesja nauki z ' || to_char(started_at, 'YYYY-MM-DD HH24:MI') into item_title
      from public.study_sessions where id = target_id and user_id = owner_id and trash_id is null;
  else raise exception 'Nieobsługiwany typ elementu.';
  end if;
  if item_title is null then raise exception 'Nie znaleziono elementu.'; end if;

  insert into public.trash_items (user_id, item_type, item_id, title)
  values (owner_id, target_type, target_id, item_title) returning id into batch_id;

  if target_type = 'module' then
    update public.modules set trash_id = batch_id where id = target_id and user_id = owner_id;
    update public.chapters set trash_id = batch_id where module_id = target_id and user_id = owner_id and trash_id is null;
    update public.topics t set trash_id = batch_id from public.chapters c
      where t.chapter_id = c.id and c.module_id = target_id and t.user_id = owner_id and t.trash_id is null;
    update public.topic_images i set trash_id = batch_id from public.topics t join public.chapters c on c.id = t.chapter_id
      where i.topic_id = t.id and c.module_id = target_id and i.user_id = owner_id and i.trash_id is null;
    update public.questions set trash_id = batch_id where module_id = target_id and user_id = owner_id and trash_id is null;
    update public.study_sessions set trash_id = batch_id where module_id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'chapter' then
    update public.chapters set trash_id = batch_id where id = target_id and user_id = owner_id;
    update public.topics set trash_id = batch_id where chapter_id = target_id and user_id = owner_id and trash_id is null;
    update public.topic_images i set trash_id = batch_id from public.topics t
      where i.topic_id = t.id and t.chapter_id = target_id and i.user_id = owner_id and i.trash_id is null;
    update public.questions set trash_id = batch_id where chapter_id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'topic' then
    update public.topics set trash_id = batch_id where id = target_id and user_id = owner_id;
    update public.topic_images set trash_id = batch_id where topic_id = target_id and user_id = owner_id and trash_id is null;
    update public.questions set trash_id = batch_id where topic_id = target_id and user_id = owner_id and trash_id is null;
  elsif target_type = 'image' then update public.topic_images set trash_id = batch_id where id = target_id and user_id = owner_id;
  elsif target_type = 'question' then update public.questions set trash_id = batch_id where id = target_id and user_id = owner_id;
  else update public.study_sessions set trash_id = batch_id where id = target_id and user_id = owner_id;
  end if;
  return batch_id;
end; $$;


--
-- Name: purge_trash_item(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.purge_trash_item(target_trash_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare owner_id uuid; kind text; entity_id uuid;
begin
  select user_id, item_type, item_id into owner_id, kind, entity_id from public.trash_items where id = target_trash_id;
  if owner_id is null or ((select auth.uid()) is distinct from owner_id and (select auth.role()) <> 'service_role')
    then raise exception 'Nie znaleziono elementu w koszu.'; end if;
  if kind = 'module' then delete from public.modules where id = entity_id and user_id = owner_id;
  elsif kind = 'chapter' then delete from public.chapters where id = entity_id and user_id = owner_id;
  elsif kind = 'topic' then delete from public.topics where id = entity_id and user_id = owner_id;
  elsif kind = 'image' then delete from public.topic_images where id = entity_id and user_id = owner_id;
  elsif kind = 'question' then delete from public.questions where id = entity_id and user_id = owner_id;
  else delete from public.study_sessions where id = entity_id and user_id = owner_id; end if;
  delete from public.trash_items where id = target_trash_id;
  delete from public.trash_items ti where ti.user_id = owner_id and (
    (ti.item_type = 'module' and not exists (select 1 from public.modules x where x.id = ti.item_id)) or
    (ti.item_type = 'chapter' and not exists (select 1 from public.chapters x where x.id = ti.item_id)) or
    (ti.item_type = 'topic' and not exists (select 1 from public.topics x where x.id = ti.item_id)) or
    (ti.item_type = 'image' and not exists (select 1 from public.topic_images x where x.id = ti.item_id)) or
    (ti.item_type = 'question' and not exists (select 1 from public.questions x where x.id = ti.item_id)) or
    (ti.item_type = 'study_session' and not exists (select 1 from public.study_sessions x where x.id = ti.item_id)));
end; $$;


--
-- Name: restore_trash_item(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.restore_trash_item(target_trash_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare owner_id uuid := (select auth.uid());
begin
  if not exists (select 1 from public.trash_items where id = target_trash_id and user_id = owner_id)
    then raise exception 'Nie znaleziono elementu w koszu.'; end if;
  update public.modules set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.chapters set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.topics set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.topic_images set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.questions set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  update public.study_sessions set trash_id = null where trash_id = target_trash_id and user_id = owner_id;
  delete from public.trash_items where id = target_trash_id and user_id = owner_id;
end; $$;


--
-- Name: create_study_session(text, text, uuid, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_study_session(study_mode text, scope_mode text, selected_chapter_id uuid DEFAULT NULL::uuid, selected_topic_id uuid DEFAULT NULL::uuid, random_chapter_count integer DEFAULT 3, requested_question_count integer DEFAULT 20) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  created_id uuid;
  inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
  then
    raise exception 'Nieprawidłowa konfiguracja sesji.';
  end if;

  insert into public.study_sessions (user_id, mode, configuration)
  values (
    (select auth.uid()),
    study_mode,
    jsonb_build_object(
      'scope', scope_mode,
      'chapterId', selected_chapter_id,
      'topicId', selected_topic_id
    )
  )
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id
    from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and exists (
        select 1
        from public.questions as question
        join public.question_options as option
          on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id
          and question.user_id = (select auth.uid())
        group by question.id
        having study_mode = 'flashcards' or count(option.id) >= 2
      )
    order by random()
    limit greatest(1, random_chapter_count)
  ),
  candidates as (
    select
      question.id,
      question.content,
      question.explanation,
      jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'content', option.content,
          'isCorrect', option.is_correct
        )
        order by option.position
      ) as option_data,
      count(option.id) as option_count
    from public.questions as question
    join public.question_options as option
      on option.question_id = question.id
      and option.user_id = (select auth.uid())
    where question.user_id = (select auth.uid())
      and (
        scope_mode = 'all'
        or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
        or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
        or (
          scope_mode = 'unassigned'
          and question.chapter_id is null
          and question.topic_id is null
        )
        or (
          scope_mode = 'random_chapters'
          and question.chapter_id in (select id from random_chapters)
        )
      )
    group by question.id
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random()
    limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items (
    user_id,
    session_id,
    question_id,
    position,
    question_snapshot,
    options_snapshot,
    explanation_snapshot
  )
  select
    (select auth.uid()),
    created_id,
    id,
    row_number() over ()::integer,
    content,
    option_data,
    explanation
  from candidates;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;

  return created_id;
end;
$$;


--
-- Name: create_study_session(uuid, text, text, uuid, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_study_session(target_module_id uuid, study_mode text, scope_mode text, selected_chapter_id uuid DEFAULT NULL::uuid, selected_topic_id uuid DEFAULT NULL::uuid, random_chapter_count integer DEFAULT 3, requested_question_count integer DEFAULT 20) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare created_id uuid; inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
    or not exists (select 1 from public.modules where id = target_module_id and user_id = (select auth.uid()))
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, study_mode,
    jsonb_build_object('scope', scope_mode, 'chapterId', selected_chapter_id, 'topicId', selected_topic_id))
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id from public.chapters as chapter
    where chapter.user_id = (select auth.uid()) and chapter.module_id = target_module_id
      and exists (
        select 1 from public.questions as question
        join public.question_options as option on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id and question.user_id = (select auth.uid())
          and question.module_id = target_module_id
        group by question.id having study_mode = 'flashcards' or count(option.id) >= 2
      )
    order by random() limit greatest(1, random_chapter_count)
  ), candidates as (
    select question.id, question.content, question.explanation,
      jsonb_agg(jsonb_build_object('id', option.id, 'content', option.content, 'isCorrect', option.is_correct) order by option.position) as option_data
    from public.questions as question
    join public.question_options as option on option.question_id = question.id
      and option.user_id = (select auth.uid())
    where question.user_id = (select auth.uid()) and question.module_id = target_module_id and (
      scope_mode = 'all'
      or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
      or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
      or (scope_mode = 'unassigned' and question.chapter_id is null and question.topic_id is null)
      or (scope_mode = 'random_chapters' and question.chapter_id in (select id from random_chapters))
    )
    group by question.id
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random() limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items
    (user_id, session_id, question_id, position, question_snapshot, options_snapshot, explanation_snapshot)
  select (select auth.uid()), created_id, id, row_number() over ()::integer,
    content, option_data, explanation from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;
  return created_id;
end;
$$;


--
-- Name: delete_empty_module(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_empty_module(target_module_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if exists (
    select 1 from public.chapters
    where module_id = target_module_id and user_id = (select auth.uid())
  ) then raise exception 'Można usunąć tylko pusty moduł.'; end if;
  delete from public.modules
  where id = target_module_id and user_id = (select auth.uid());
  if not found then raise exception 'Nie znaleziono modułu.'; end if;
end;
$$;


--
-- Name: delete_module_cascade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_module_cascade(target_module_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  delete from public.modules
  where id = target_module_id and user_id = (select auth.uid());
  if not found then raise exception 'Nie znaleziono modułu.'; end if;
end;
$$;


--
-- Name: delete_notes_bulk(uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_notes_bulk(chapter_ids uuid[] DEFAULT ARRAY[]::uuid[], topic_ids uuid[] DEFAULT ARRAY[]::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  deleted_topics integer := 0;
  deleted_chapters integer := 0;
  affected_rows integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;

  delete from public.topics as topic
  where topic.user_id = (select auth.uid())
    and topic.id = any(coalesce(topic_ids, array[]::uuid[]))
    and not (topic.chapter_id = any(coalesce(chapter_ids, array[]::uuid[])));
  get diagnostics deleted_topics = row_count;

  select count(*)::integer
  into affected_rows
  from public.topics as topic
  where topic.user_id = (select auth.uid())
    and topic.chapter_id = any(coalesce(chapter_ids, array[]::uuid[]));

  delete from public.chapters as chapter
  where chapter.user_id = (select auth.uid())
    and chapter.id = any(coalesce(chapter_ids, array[]::uuid[]));
  get diagnostics deleted_chapters = row_count;

  deleted_topics := deleted_topics + affected_rows;

  return jsonb_build_object(
    'deletedChapters', deleted_chapters,
    'deletedTopics', deleted_topics
  );
end;
$$;


--
-- Name: get_chapter_gallery_images(uuid, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chapter_gallery_images(target_module_id uuid, target_chapter_id uuid, page_offset integer DEFAULT 0, page_limit integer DEFAULT 5) RETURNS TABLE(id uuid, topic_id uuid, storage_key text, original_filename text, format text, width integer, height integer, bytes bigint, image_position bigint, topic_title text, topic_slug text, chapter_id uuid, chapter_title text, chapter_slug text, chapter_total bigint)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if page_offset < 0 or page_limit < 1 or page_limit > 13
  then raise exception 'Nieprawidłowa paginacja galerii.'; end if;

  return query
  select image.id, image.topic_id, image.storage_key,
    image.original_filename, image.format, image.width, image.height,
    image.bytes, image.position, topic.title, topic.slug,
    chapter.id, chapter.title, chapter.slug,
    count(*) over () as chapter_total
  from public.topic_images as image
  join public.topics as topic on topic.id = image.topic_id
    and topic.user_id = image.user_id
  join public.chapters as chapter on chapter.id = topic.chapter_id
    and chapter.user_id = topic.user_id
  where chapter.module_id = target_module_id
    and chapter.id = target_chapter_id
    and image.user_id = (select auth.uid())
  order by topic.position, image.position, image.id
  offset page_offset limit page_limit;
end;
$$;


--
-- Name: get_chapter_summaries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chapter_summaries() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(jsonb_agg(summary.payload order by summary.position, summary.id), '[]'::jsonb)
  from (
    select
      chapter.id,
      chapter.position,
      jsonb_build_object(
        'id', chapter.id,
        'slug', chapter.slug,
        'title', chapter.title,
        'position', chapter.position,
        'topicsCount', count(topic.id),
        'completedTopicsCount', count(topic.id) filter (where topic.completed),
        'firstIncompleteTopicId', (
          array_agg(topic.id order by topic.position, topic.id)
            filter (where not topic.completed)
        )[1],
        'firstIncompleteTopicSlug', (
          array_agg(topic.slug order by topic.position, topic.id)
            filter (where not topic.completed)
        )[1]
      ) as payload
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
    where chapter.user_id = (select auth.uid())
    group by chapter.id
  ) as summary;
$$;


--
-- Name: get_learning_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_learning_summary() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: get_module_gallery_images(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_module_gallery_images(target_module_id uuid, sort_mode text, page_offset integer DEFAULT 0, page_limit integer DEFAULT 13) RETURNS TABLE(id uuid, topic_id uuid, storage_key text, original_filename text, format text, width integer, height integer, bytes bigint, image_position bigint, topic_title text, topic_slug text, chapter_id uuid, chapter_title text, chapter_slug text)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if sort_mode not in ('manual', 'az', 'za', 'completed', 'incomplete')
    or page_offset < 0 or page_limit < 1 or page_limit > 25
  then raise exception 'Nieprawidłowe sortowanie lub paginacja galerii.'; end if;

  return query
  with chapter_progress as (
    select chapter.id,
      count(topic.id) > 0 and bool_and(topic.completed) as completed
    from public.chapters as chapter
    left join public.topics as topic on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
    group by chapter.id
  )
  select image.id, image.topic_id, image.storage_key,
    image.original_filename, image.format, image.width, image.height,
    image.bytes, image.position, topic.title, topic.slug,
    chapter.id, chapter.title, chapter.slug
  from public.topic_images as image
  join public.topics as topic on topic.id = image.topic_id
    and topic.user_id = image.user_id
  join public.chapters as chapter on chapter.id = topic.chapter_id
    and chapter.user_id = topic.user_id
  join chapter_progress as progress on progress.id = chapter.id
  where chapter.module_id = target_module_id
    and image.user_id = (select auth.uid())
  order by
    case when sort_mode = 'completed' then progress.completed::integer end desc,
    case when sort_mode = 'incomplete' then progress.completed::integer end asc,
    case when sort_mode in ('manual', 'completed', 'incomplete') then chapter.position end asc,
    case when sort_mode = 'az' then lower(chapter.title) end asc,
    case when sort_mode = 'za' then lower(chapter.title) end desc,
    chapter.id,
    topic.position,
    image.position,
    image.id
  offset page_offset limit page_limit;
end;
$$;


--
-- Name: get_module_gallery_sections(uuid, text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_module_gallery_sections(target_module_id uuid, sort_mode text, per_chapter_limit integer DEFAULT 4, chapter_offset integer DEFAULT 0, chapter_limit integer DEFAULT 7) RETURNS TABLE(id uuid, topic_id uuid, storage_key text, original_filename text, format text, width integer, height integer, bytes bigint, image_position bigint, topic_title text, topic_slug text, chapter_id uuid, chapter_title text, chapter_slug text, chapter_total bigint)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if sort_mode not in ('manual', 'az', 'za', 'completed', 'incomplete')
    or per_chapter_limit < 1 or per_chapter_limit > 12
    or chapter_offset < 0 or chapter_limit < 1 or chapter_limit > 13
  then raise exception 'Nieprawidłowe sortowanie galerii.'; end if;

  return query
  with chapter_progress as (
    select chapter.id, chapter.title, chapter.slug, chapter.position,
      count(topic.id) > 0 and bool_and(topic.completed) as completed
    from public.chapters as chapter
    left join public.topics as topic on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
    group by chapter.id, chapter.title, chapter.slug, chapter.position
  ), selected_chapters as (
    select progress.*
    from chapter_progress as progress
    where exists (
      select 1
      from public.topics as topic
      join public.topic_images as image on image.topic_id = topic.id
        and image.user_id = topic.user_id
      where topic.chapter_id = progress.id
        and topic.user_id = (select auth.uid())
    )
    order by
      case when sort_mode = 'completed' then progress.completed::integer end desc,
      case when sort_mode = 'incomplete' then progress.completed::integer end asc,
      case when sort_mode in ('manual', 'completed', 'incomplete') then progress.position end asc,
      case when sort_mode = 'az' then lower(progress.title) end asc,
      case when sort_mode = 'za' then lower(progress.title) end desc,
      progress.id
    offset chapter_offset limit chapter_limit
  ), ranked as (
    select image.id, image.topic_id, image.storage_key,
      image.original_filename, image.format, image.width, image.height,
      image.bytes, image.position as image_position,
      topic.title as topic_title, topic.slug as topic_slug,
      topic.position as topic_position,
      chapter.id as chapter_id, chapter.title as chapter_title,
      chapter.slug as chapter_slug, chapter.position as chapter_position,
      progress.completed as chapter_completed,
      count(*) over (partition by chapter.id) as chapter_total,
      row_number() over (
        partition by chapter.id order by topic.position, image.position, image.id
      ) as chapter_row
    from public.topic_images as image
    join public.topics as topic on topic.id = image.topic_id
      and topic.user_id = image.user_id
    join public.chapters as chapter on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    join selected_chapters as progress on progress.id = chapter.id
    where chapter.module_id = target_module_id
      and image.user_id = (select auth.uid())
  )
  select ranked.id, ranked.topic_id, ranked.storage_key,
    ranked.original_filename, ranked.format, ranked.width, ranked.height,
    ranked.bytes, ranked.image_position, ranked.topic_title,
    ranked.topic_slug, ranked.chapter_id, ranked.chapter_title,
    ranked.chapter_slug, ranked.chapter_total
  from ranked
  where ranked.chapter_row <= per_chapter_limit
  order by
    case when sort_mode = 'completed' then ranked.chapter_completed::integer end desc,
    case when sort_mode = 'incomplete' then ranked.chapter_completed::integer end asc,
    case when sort_mode in ('manual', 'completed', 'incomplete') then ranked.chapter_position end asc,
    case when sort_mode = 'az' then lower(ranked.chapter_title) end asc,
    case when sort_mode = 'za' then lower(ranked.chapter_title) end desc,
    ranked.chapter_id, ranked.topic_position, ranked.image_position, ranked.id;
end;
$$;


--
-- Name: get_module_image_keys(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_module_image_keys(target_module_id uuid) RETURNS TABLE(storage_key text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select image.storage_key
  from public.topic_images as image
  join public.topics as topic
    on topic.id = image.topic_id and topic.user_id = image.user_id
  join public.chapters as chapter
    on chapter.id = topic.chapter_id and chapter.user_id = topic.user_id
  where chapter.module_id = target_module_id
    and chapter.user_id = (select auth.uid());
$$;


--
-- Name: get_question_bank_availability(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_question_bank_availability(selected_chapter_id uuid DEFAULT NULL::uuid, selected_topic_id uuid DEFAULT NULL::uuid, only_unassigned boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with owned_questions as (
    select question.id
    from public.questions as question
    where question.user_id = (select auth.uid())
      and (selected_chapter_id is null or question.chapter_id = selected_chapter_id)
      and (selected_topic_id is null or question.topic_id = selected_topic_id)
      and (not only_unassigned or (question.chapter_id is null and question.topic_id is null))
  ),
  option_counts as (
    select question.id, count(option.id) as option_count
    from owned_questions as question
    left join public.question_options as option
      on option.question_id = question.id
      and option.user_id = (select auth.uid())
    group by question.id
  )
  select jsonb_build_object(
    'flashcardsCount', count(*) filter (where option_count >= 1),
    'testQuestionsCount', count(*) filter (where option_count >= 2)
  )
  from option_counts;
$$;


--
-- Name: get_question_bank_availability(uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_question_bank_availability(target_module_id uuid, selected_chapter_id uuid DEFAULT NULL::uuid, selected_topic_id uuid DEFAULT NULL::uuid, only_unassigned boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with owned_questions as (
    select question.id
    from public.questions as question
    where question.user_id = (select auth.uid())
      and question.module_id = target_module_id
      and (selected_chapter_id is null or question.chapter_id = selected_chapter_id)
      and (selected_topic_id is null or question.topic_id = selected_topic_id)
      and (not only_unassigned or (question.chapter_id is null and question.topic_id is null))
  ), option_counts as (
    select question.id, count(option.id) as option_count
    from owned_questions as question
    left join public.question_options as option
      on option.question_id = question.id and option.user_id = (select auth.uid())
    group by question.id
  )
  select jsonb_build_object(
    'flashcardsCount', count(*) filter (where option_count >= 1),
    'testQuestionsCount', count(*) filter (where option_count >= 2)
  ) from option_counts;
$$;


--
-- Name: get_topic_navigation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_topic_navigation(current_topic_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with ordered_topics as (
    select
      topic.id as topic_id,
      topic.slug as topic_slug,
      topic.title as topic_title,
      chapter.id as chapter_id,
      chapter.slug as chapter_slug,
      chapter.title as chapter_title,
      row_number() over (
        order by chapter.position, chapter.id, topic.position, topic.id
      ) as topic_index,
      count(*) over () as total
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
      and chapter.user_id = (select auth.uid())
  ),
  current_topic as (
    select * from ordered_topics where topic_id = current_topic_id
  )
  select jsonb_build_object(
    'currentIndex', current_topic.topic_index - 1,
    'total', current_topic.total,
    'previous', (
      select jsonb_build_object(
        'chapterId', item.chapter_id,
        'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title,
        'topicId', item.topic_id,
        'topicSlug', item.topic_slug,
        'topicTitle', item.topic_title
      )
      from ordered_topics as item
      where item.topic_index = current_topic.topic_index - 1
    ),
    'next', (
      select jsonb_build_object(
        'chapterId', item.chapter_id,
        'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title,
        'topicId', item.topic_id,
        'topicSlug', item.topic_slug,
        'topicTitle', item.topic_title
      )
      from ordered_topics as item
      where item.topic_index = current_topic.topic_index + 1
    )
  )
  from current_topic;
$$;


--
-- Name: get_trash_image_keys(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_trash_image_keys(target_trash_id uuid) RETURNS TABLE(storage_key text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select * from private.get_trash_image_keys(target_trash_id);
$$;


--
-- Name: move_notes_to_trash(uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_notes_to_trash(chapter_ids uuid[], topic_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare item_id uuid;
begin
  foreach item_id in array chapter_ids loop perform public.move_to_trash('chapter', item_id); end loop;
  foreach item_id in array topic_ids loop
    if exists (select 1 from public.topics where id = item_id and user_id = (select auth.uid()) and trash_id is null)
      then perform public.move_to_trash('topic', item_id); end if;
  end loop;
end; $$;


--
-- Name: move_to_trash(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_to_trash(target_type text, target_id uuid) RETURNS uuid
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select private.move_to_trash(target_type, target_id);
$$;


--
-- Name: move_topic(uuid, uuid, uuid, text, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_topic(moved_topic_id uuid, source_chapter_id uuid, target_chapter_id uuid, target_slug text, source_topic_ids uuid[], target_topic_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: purge_trash_item(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_trash_item(target_trash_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select private.purge_trash_item(target_trash_id);
$$;


--
-- Name: reorder_chapters(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_chapters(chapter_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: reorder_modules(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_modules(module_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if cardinality(module_ids) <> (
    select count(*) from public.modules where user_id = (select auth.uid())
  ) or exists (
    select 1 from unnest(module_ids) as candidate(id)
    left join public.modules as module on module.id = candidate.id
      and module.user_id = (select auth.uid())
    where module.id is null
  ) or (select count(distinct id) from unnest(module_ids) as item(id)) <> cardinality(module_ids)
  then raise exception 'Nieprawidłowa kolejność modułów.'; end if;

  update public.modules as module
  set position = ordered.position * 1000
  from unnest(module_ids) with ordinality as ordered(id, position)
  where module.id = ordered.id and module.user_id = (select auth.uid());
end;
$$;


--
-- Name: reorder_topic_images(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_topic_images(target_topic_id uuid, image_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  stored_count integer;
  supplied_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select count(*)
  into stored_count
  from public.topic_images
  where topic_id = target_topic_id
    and user_id = (select auth.uid());

  select count(distinct supplied.id)
  into supplied_count
  from unnest(coalesce(image_ids, array[]::uuid[])) as supplied(id);

  if cardinality(coalesce(image_ids, array[]::uuid[])) <> supplied_count
    or supplied_count <> stored_count
    or exists (
      select 1
      from unnest(coalesce(image_ids, array[]::uuid[])) as supplied(id)
      where not exists (
        select 1
        from public.topic_images image
        where image.id = supplied.id
          and image.topic_id = target_topic_id
          and image.user_id = (select auth.uid())
      )
    )
  then
    raise exception 'Image list does not match the topic images';
  end if;

  update public.topic_images as image
  set position = ordered.position
  from (
    select id, ordinality::bigint as position
    from unnest(image_ids) with ordinality as item(id, ordinality)
  ) as ordered
  where image.id = ordered.id
    and image.topic_id = target_topic_id
    and image.user_id = (select auth.uid());
end;
$$;


--
-- Name: reorder_topics(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_topics(target_chapter_id uuid, topic_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: restore_trash_item(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_trash_item(target_trash_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select private.restore_trash_item(target_trash_id);
$$;


--
-- Name: save_question(uuid, text, text, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_question(question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  saved_id uuid := coalesce(question_id, gen_random_uuid());
  option_count integer;
  correct_count integer;
begin
  select count(*), count(*) filter (where coalesce((item->>'isCorrect')::boolean, false))
  into option_count, correct_count
  from jsonb_array_elements(options) as item;
  if btrim(question_content) = '' or option_count < 1 or correct_count <> 1
    or exists (select 1 from jsonb_array_elements(options) item where btrim(item->>'content') = '') then
    raise exception 'Pytanie wymaga treści i dokładnie jednej poprawnej odpowiedzi.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(options) item
    group by lower(btrim(item->>'content')) having count(*) > 1
  ) then
    raise exception 'Odpowiedzi nie mogą się powtarzać.';
  end if;
  if selected_topic_id is not null then
    select topic.chapter_id into selected_chapter_id
    from public.topics as topic
    where topic.id = selected_topic_id and topic.user_id = (select auth.uid());
    if selected_chapter_id is null then raise exception 'Nie znaleziono tematu.'; end if;
  end if;

  insert into public.questions (id, user_id, chapter_id, topic_id, content, explanation)
  values (saved_id, (select auth.uid()), selected_chapter_id, selected_topic_id, btrim(question_content), nullif(btrim(question_explanation), ''))
  on conflict (id) do update set
    chapter_id = excluded.chapter_id,
    topic_id = excluded.topic_id,
    content = excluded.content,
    explanation = excluded.explanation,
    updated_at = now()
  where questions.user_id = (select auth.uid());

  delete from public.question_options where question_options.question_id = saved_id and user_id = (select auth.uid());
  insert into public.question_options (user_id, question_id, content, is_correct, position)
  select (select auth.uid()), saved_id, btrim(item->>'content'), (item->>'isCorrect')::boolean, ordinality::integer
  from jsonb_array_elements(options) with ordinality as source(item, ordinality);
  return saved_id;
end;
$$;


--
-- Name: save_question(uuid, uuid, text, text, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_question(target_module_id uuid, question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  saved_id uuid := coalesce(question_id, gen_random_uuid());
  option_count integer;
  correct_count integer;
begin
  if not exists (
    select 1 from public.modules
    where id = target_module_id and user_id = (select auth.uid())
  ) then raise exception 'Nie znaleziono modułu.'; end if;

  select count(*), count(*) filter (where coalesce((item->>'isCorrect')::boolean, false))
  into option_count, correct_count from jsonb_array_elements(options) as item;
  if btrim(question_content) = '' or option_count < 1 or correct_count <> 1
    or exists (select 1 from jsonb_array_elements(options) item where btrim(item->>'content') = '')
  then raise exception 'Pytanie wymaga treści i dokładnie jednej poprawnej odpowiedzi.'; end if;
  if exists (
    select 1 from jsonb_array_elements(options) item
    group by lower(btrim(item->>'content')) having count(*) > 1
  ) then raise exception 'Odpowiedzi nie mogą się powtarzać.'; end if;

  if selected_topic_id is not null then
    select topic.chapter_id into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = selected_topic_id and topic.user_id = (select auth.uid())
      and chapter.module_id = target_module_id;
    if selected_chapter_id is null then raise exception 'Nie znaleziono tematu w module.'; end if;
  elsif selected_chapter_id is not null and not exists (
    select 1 from public.chapters
    where id = selected_chapter_id and user_id = (select auth.uid())
      and module_id = target_module_id
  ) then raise exception 'Nie znaleziono rozdziału w module.'; end if;

  insert into public.questions (id, user_id, module_id, chapter_id, topic_id, content, explanation)
  values (saved_id, (select auth.uid()), target_module_id, selected_chapter_id, selected_topic_id, btrim(question_content), nullif(btrim(question_explanation), ''))
  on conflict (id) do update set
    module_id = excluded.module_id, chapter_id = excluded.chapter_id,
    topic_id = excluded.topic_id, content = excluded.content,
    explanation = excluded.explanation, updated_at = now()
  where questions.user_id = (select auth.uid()) and questions.module_id = target_module_id;

  delete from public.question_options
  where question_options.question_id = saved_id and user_id = (select auth.uid());
  insert into public.question_options (user_id, question_id, content, is_correct, position)
  select (select auth.uid()), saved_id, btrim(item->>'content'),
    (item->>'isCorrect')::boolean, ordinality::integer
  from jsonb_array_elements(options) with ordinality as source(item, ordinality);
  return saved_id;
end;
$$;


--
-- Name: sync_chapter_questions_module(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_chapter_questions_module() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.module_id is distinct from old.module_id then
    update public.questions
    set module_id = new.module_id, updated_at = now()
    where chapter_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    "position" bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    module_id uuid NOT NULL,
    trash_id uuid,
    CONSTRAINT chapters_slug_check CHECK ((btrim(slug) <> ''::text)),
    CONSTRAINT chapters_title_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    "position" bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trash_id uuid,
    CONSTRAINT modules_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)))
);


--
-- Name: question_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    content text NOT NULL,
    is_correct boolean DEFAULT false NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT question_options_content_not_blank CHECK ((btrim(content) <> ''::text)),
    CONSTRAINT question_options_position_check CHECK (("position" > 0))
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    chapter_id uuid,
    topic_id uuid,
    content text NOT NULL,
    explanation text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    module_id uuid NOT NULL,
    trash_id uuid,
    CONSTRAINT questions_content_not_blank CHECK ((btrim(content) <> ''::text)),
    CONSTRAINT questions_explanation_not_blank CHECK (((explanation IS NULL) OR (btrim(explanation) <> ''::text)))
);


--
-- Name: study_session_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_session_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    question_id uuid,
    "position" integer NOT NULL,
    question_snapshot text NOT NULL,
    options_snapshot jsonb NOT NULL,
    explanation_snapshot text,
    selected_option_id uuid,
    result text,
    answered_at timestamp with time zone,
    CONSTRAINT study_session_items_position_check CHECK (("position" > 0)),
    CONSTRAINT study_session_items_result_check CHECK (((result IS NULL) OR (result = ANY (ARRAY['remembered'::text, 'forgotten'::text, 'correct'::text, 'incorrect'::text]))))
);


--
-- Name: study_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mode text NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    module_id uuid NOT NULL,
    trash_id uuid,
    CONSTRAINT study_sessions_mode_check CHECK ((mode = ANY (ARRAY['flashcards'::text, 'test'::text]))),
    CONSTRAINT study_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'abandoned'::text])))
);


--
-- Name: topic_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    user_id uuid NOT NULL,
    storage_key text NOT NULL,
    original_filename text NOT NULL,
    format text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    bytes bigint NOT NULL,
    "position" bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trash_id uuid,
    CONSTRAINT topic_images_bytes_check CHECK ((bytes > 0)),
    CONSTRAINT topic_images_format_check CHECK ((format = 'webp'::text)),
    CONSTRAINT topic_images_height_check CHECK ((height > 0)),
    CONSTRAINT topic_images_width_check CHECK ((width > 0))
);


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    chapter_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    content jsonb DEFAULT '{"type": "doc", "content": [{"type": "paragraph"}]}'::jsonb NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    "position" bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trash_id uuid,
    CONSTRAINT topics_slug_check CHECK ((btrim(slug) <> ''::text)),
    CONSTRAINT topics_title_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: trash_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trash_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    item_type text NOT NULL,
    item_id uuid NOT NULL,
    title text NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    purge_after timestamp with time zone DEFAULT (now() + '1 day'::interval) NOT NULL,
    CONSTRAINT trash_items_item_type_check CHECK ((item_type = ANY (ARRAY['module'::text, 'chapter'::text, 'topic'::text, 'image'::text, 'question'::text, 'study_session'::text])))
);


--
-- Name: chapters chapters_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_id_user_id_key UNIQUE (id, user_id);


--
-- Name: chapters chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);


--
-- Name: modules modules_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_id_user_id_key UNIQUE (id, user_id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


--
-- Name: question_options question_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_pkey PRIMARY KEY (id);


--
-- Name: question_options question_options_question_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_question_id_position_key UNIQUE (question_id, "position");


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: study_session_items study_session_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session_items
    ADD CONSTRAINT study_session_items_pkey PRIMARY KEY (id);


--
-- Name: study_session_items study_session_items_session_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session_items
    ADD CONSTRAINT study_session_items_session_id_position_key UNIQUE (session_id, "position");


--
-- Name: study_sessions study_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_sessions
    ADD CONSTRAINT study_sessions_pkey PRIMARY KEY (id);


--
-- Name: topic_images topic_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_images
    ADD CONSTRAINT topic_images_pkey PRIMARY KEY (id);


--
-- Name: topic_images topic_images_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_images
    ADD CONSTRAINT topic_images_storage_key_key UNIQUE (storage_key);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: trash_items trash_items_item_type_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_items
    ADD CONSTRAINT trash_items_item_type_item_id_key UNIQUE (item_type, item_id);


--
-- Name: trash_items trash_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_items
    ADD CONSTRAINT trash_items_pkey PRIMARY KEY (id);


--
-- Name: chapters_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_active_idx ON public.chapters USING btree (module_id, "position", id) WHERE (trash_id IS NULL);


--
-- Name: chapters_module_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chapters_module_slug_idx ON public.chapters USING btree (module_id, slug) WHERE (trash_id IS NULL);


--
-- Name: chapters_module_user_position_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_module_user_position_id_idx ON public.chapters USING btree (module_id, user_id, "position", id);


--
-- Name: chapters_title_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_title_search_idx ON public.chapters USING gin (lower(title) extensions.gin_trgm_ops);


--
-- Name: chapters_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_title_trgm_idx ON public.chapters USING gin (title extensions.gin_trgm_ops);


--
-- Name: chapters_user_position_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_user_position_id_idx ON public.chapters USING btree (user_id, "position", id);


--
-- Name: modules_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modules_active_idx ON public.modules USING btree (user_id, "position", id) WHERE (trash_id IS NULL);


--
-- Name: modules_user_normalized_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modules_user_normalized_name_idx ON public.modules USING btree (user_id, lower(btrim(name))) WHERE (trash_id IS NULL);


--
-- Name: modules_user_position_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modules_user_position_id_idx ON public.modules USING btree (user_id, "position", id);


--
-- Name: question_options_user_question_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_options_user_question_position_idx ON public.question_options USING btree (user_id, question_id, "position");


--
-- Name: questions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_active_idx ON public.questions USING btree (module_id, created_at DESC) WHERE (trash_id IS NULL);


--
-- Name: questions_user_chapter_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_user_chapter_topic_idx ON public.questions USING btree (user_id, chapter_id, topic_id);


--
-- Name: questions_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_user_created_idx ON public.questions USING btree (user_id, created_at DESC);


--
-- Name: questions_user_module_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_user_module_created_idx ON public.questions USING btree (user_id, module_id, created_at DESC);


--
-- Name: study_session_items_user_session_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX study_session_items_user_session_position_idx ON public.study_session_items USING btree (user_id, session_id, "position");


--
-- Name: study_sessions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX study_sessions_active_idx ON public.study_sessions USING btree (module_id, started_at DESC) WHERE (trash_id IS NULL);


--
-- Name: study_sessions_user_module_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX study_sessions_user_module_started_idx ON public.study_sessions USING btree (user_id, module_id, started_at DESC);


--
-- Name: study_sessions_user_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX study_sessions_user_started_idx ON public.study_sessions USING btree (user_id, started_at DESC);


--
-- Name: topic_images_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topic_images_active_idx ON public.topic_images USING btree (topic_id, "position", id) WHERE (trash_id IS NULL);


--
-- Name: topic_images_topic_user_position_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topic_images_topic_user_position_id_idx ON public.topic_images USING btree (topic_id, user_id, "position", id);


--
-- Name: topic_images_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topic_images_user_id_idx ON public.topic_images USING btree (user_id);


--
-- Name: topics_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_active_idx ON public.topics USING btree (chapter_id, "position", id) WHERE (trash_id IS NULL);


--
-- Name: topics_chapter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_chapter_id_idx ON public.topics USING btree (chapter_id);


--
-- Name: topics_chapter_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX topics_chapter_slug_idx ON public.topics USING btree (chapter_id, slug) WHERE (trash_id IS NULL);


--
-- Name: topics_id_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX topics_id_user_id_unique ON public.topics USING btree (id, user_id);


--
-- Name: topics_title_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_title_search_idx ON public.topics USING gin (lower(title) extensions.gin_trgm_ops);


--
-- Name: topics_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_title_trgm_idx ON public.topics USING gin (title extensions.gin_trgm_ops);


--
-- Name: topics_user_chapter_position_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_user_chapter_position_id_idx ON public.topics USING btree (user_id, chapter_id, "position", id);


--
-- Name: trash_items_purge_after_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trash_items_purge_after_idx ON public.trash_items USING btree (purge_after);


--
-- Name: trash_items_user_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trash_items_user_deleted_idx ON public.trash_items USING btree (user_id, deleted_at DESC);


--
-- Name: chapters sync_chapter_questions_module; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_chapter_questions_module AFTER UPDATE OF module_id ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.sync_chapter_questions_module();


--
-- Name: chapters chapters_module_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_module_owner_fkey FOREIGN KEY (module_id, user_id) REFERENCES public.modules(id, user_id) ON DELETE CASCADE;


--
-- Name: chapters chapters_trash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_trash_id_fkey FOREIGN KEY (trash_id) REFERENCES public.trash_items(id) ON DELETE SET NULL;


--
-- Name: chapters chapters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: modules modules_trash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_trash_id_fkey FOREIGN KEY (trash_id) REFERENCES public.trash_items(id) ON DELETE SET NULL;


--
-- Name: modules modules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: question_options question_options_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: question_options question_options_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: questions questions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE SET NULL;


--
-- Name: questions questions_module_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_module_owner_fkey FOREIGN KEY (module_id, user_id) REFERENCES public.modules(id, user_id) ON DELETE CASCADE;


--
-- Name: questions questions_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;


--
-- Name: questions questions_trash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_trash_id_fkey FOREIGN KEY (trash_id) REFERENCES public.trash_items(id) ON DELETE SET NULL;


--
-- Name: questions questions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: study_session_items study_session_items_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session_items
    ADD CONSTRAINT study_session_items_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE SET NULL;


--
-- Name: study_session_items study_session_items_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session_items
    ADD CONSTRAINT study_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.study_sessions(id) ON DELETE CASCADE;


--
-- Name: study_session_items study_session_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session_items
    ADD CONSTRAINT study_session_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: study_sessions study_sessions_module_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_sessions
    ADD CONSTRAINT study_sessions_module_owner_fkey FOREIGN KEY (module_id, user_id) REFERENCES public.modules(id, user_id) ON DELETE CASCADE;


--
-- Name: study_sessions study_sessions_trash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_sessions
    ADD CONSTRAINT study_sessions_trash_id_fkey FOREIGN KEY (trash_id) REFERENCES public.trash_items(id) ON DELETE SET NULL;


--
-- Name: study_sessions study_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_sessions
    ADD CONSTRAINT study_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: topic_images topic_images_topic_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_images
    ADD CONSTRAINT topic_images_topic_owner_fkey FOREIGN KEY (topic_id, user_id) REFERENCES public.topics(id, user_id) ON DELETE CASCADE;


--
-- Name: topic_images topic_images_trash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_images
    ADD CONSTRAINT topic_images_trash_id_fkey FOREIGN KEY (trash_id) REFERENCES public.trash_items(id) ON DELETE SET NULL;


--
-- Name: topic_images topic_images_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_images
    ADD CONSTRAINT topic_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: topics topics_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_chapter_id_fkey FOREIGN KEY (chapter_id, user_id) REFERENCES public.chapters(id, user_id) ON DELETE CASCADE;


--
-- Name: topics topics_trash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_trash_id_fkey FOREIGN KEY (trash_id) REFERENCES public.trash_items(id) ON DELETE SET NULL;


--
-- Name: topics topics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: trash_items trash_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trash_items
    ADD CONSTRAINT trash_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chapters Only active chapters are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only active chapters are readable" ON public.chapters AS RESTRICTIVE FOR SELECT TO authenticated USING ((trash_id IS NULL));


--
-- Name: topic_images Only active images are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only active images are readable" ON public.topic_images AS RESTRICTIVE FOR SELECT TO authenticated USING ((trash_id IS NULL));


--
-- Name: modules Only active modules are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only active modules are readable" ON public.modules AS RESTRICTIVE FOR SELECT TO authenticated USING ((trash_id IS NULL));


--
-- Name: questions Only active questions are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only active questions are readable" ON public.questions AS RESTRICTIVE FOR SELECT TO authenticated USING ((trash_id IS NULL));


--
-- Name: study_sessions Only active sessions are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only active sessions are readable" ON public.study_sessions AS RESTRICTIVE FOR SELECT TO authenticated USING ((trash_id IS NULL));


--
-- Name: topics Only active topics are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only active topics are readable" ON public.topics AS RESTRICTIVE FOR SELECT TO authenticated USING ((trash_id IS NULL));


--
-- Name: study_session_items Only items of active sessions are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only items of active sessions are readable" ON public.study_session_items AS RESTRICTIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.study_sessions s
  WHERE ((s.id = study_session_items.session_id) AND (s.trash_id IS NULL)))));


--
-- Name: question_options Only options of active questions are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only options of active questions are readable" ON public.question_options AS RESTRICTIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.questions q
  WHERE ((q.id = question_options.question_id) AND (q.trash_id IS NULL)))));


--
-- Name: topic_images Users can delete own topic images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own topic images" ON public.topic_images FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: topic_images Users can insert own topic images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own topic images" ON public.topic_images FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: topic_images Users can read own topic images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own topic images" ON public.topic_images FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: topic_images Users can update own topic images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own topic images" ON public.topic_images FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: modules Users delete own modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own modules" ON public.modules FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: trash_items Users delete own trash; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own trash" ON public.trash_items FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: modules Users insert own modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own modules" ON public.modules FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: chapters Users manage own chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own chapters" ON public.chapters TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: question_options Users manage own question options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own question options" ON public.question_options TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.questions
  WHERE ((questions.id = question_options.question_id) AND (questions.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: questions Users manage own questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own questions" ON public.questions TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND ((chapter_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.chapters
  WHERE ((chapters.id = questions.chapter_id) AND (chapters.user_id = ( SELECT auth.uid() AS uid)))))) AND ((topic_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.topics
  WHERE ((topics.id = questions.topic_id) AND (topics.user_id = ( SELECT auth.uid() AS uid)) AND ((topics.chapter_id IS NULL) OR (topics.chapter_id = questions.chapter_id))))))));


--
-- Name: study_session_items Users manage own study session items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own study session items" ON public.study_session_items TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.study_sessions
  WHERE ((study_sessions.id = study_session_items.session_id) AND (study_sessions.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: study_sessions Users manage own study sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own study sessions" ON public.study_sessions TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id))) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: topics Users manage own topics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own topics" ON public.topics TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: trash_items Users read own trash; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own trash" ON public.trash_items FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: modules Users select own modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users select own modules" ON public.modules FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: modules Users update own modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own modules" ON public.modules FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

--
-- Name: question_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

--
-- Name: questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

--
-- Name: study_session_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.study_session_items ENABLE ROW LEVEL SECURITY;

--
-- Name: study_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: topic_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic_images ENABLE ROW LEVEL SECURITY;

--
-- Name: topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

--
-- Name: trash_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trash_items ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION get_trash_image_keys(target_trash_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.get_trash_image_keys(target_trash_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.get_trash_image_keys(target_trash_id uuid) TO authenticated;
GRANT ALL ON FUNCTION private.get_trash_image_keys(target_trash_id uuid) TO service_role;


--
-- Name: FUNCTION move_to_trash(target_type text, target_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.move_to_trash(target_type text, target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.move_to_trash(target_type text, target_id uuid) TO authenticated;


--
-- Name: FUNCTION purge_trash_item(target_trash_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.purge_trash_item(target_trash_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.purge_trash_item(target_trash_id uuid) TO authenticated;
GRANT ALL ON FUNCTION private.purge_trash_item(target_trash_id uuid) TO service_role;


--
-- Name: FUNCTION restore_trash_item(target_trash_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.restore_trash_item(target_trash_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.restore_trash_item(target_trash_id uuid) TO authenticated;


--
-- Name: FUNCTION create_study_session(study_mode text, scope_mode text, selected_chapter_id uuid, selected_topic_id uuid, random_chapter_count integer, requested_question_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_study_session(study_mode text, scope_mode text, selected_chapter_id uuid, selected_topic_id uuid, random_chapter_count integer, requested_question_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_study_session(study_mode text, scope_mode text, selected_chapter_id uuid, selected_topic_id uuid, random_chapter_count integer, requested_question_count integer) TO authenticated;


--
-- Name: FUNCTION create_study_session(target_module_id uuid, study_mode text, scope_mode text, selected_chapter_id uuid, selected_topic_id uuid, random_chapter_count integer, requested_question_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_study_session(target_module_id uuid, study_mode text, scope_mode text, selected_chapter_id uuid, selected_topic_id uuid, random_chapter_count integer, requested_question_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_study_session(target_module_id uuid, study_mode text, scope_mode text, selected_chapter_id uuid, selected_topic_id uuid, random_chapter_count integer, requested_question_count integer) TO authenticated;


--
-- Name: FUNCTION delete_empty_module(target_module_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_empty_module(target_module_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_empty_module(target_module_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_module_cascade(target_module_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_module_cascade(target_module_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_module_cascade(target_module_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_notes_bulk(chapter_ids uuid[], topic_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_notes_bulk(chapter_ids uuid[], topic_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_notes_bulk(chapter_ids uuid[], topic_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION get_chapter_gallery_images(target_module_id uuid, target_chapter_id uuid, page_offset integer, page_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_chapter_gallery_images(target_module_id uuid, target_chapter_id uuid, page_offset integer, page_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_chapter_gallery_images(target_module_id uuid, target_chapter_id uuid, page_offset integer, page_limit integer) TO authenticated;


--
-- Name: FUNCTION get_chapter_summaries(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_chapter_summaries() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_chapter_summaries() TO authenticated;


--
-- Name: FUNCTION get_learning_summary(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_learning_summary() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_learning_summary() TO authenticated;


--
-- Name: FUNCTION get_module_gallery_images(target_module_id uuid, sort_mode text, page_offset integer, page_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_module_gallery_images(target_module_id uuid, sort_mode text, page_offset integer, page_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_module_gallery_images(target_module_id uuid, sort_mode text, page_offset integer, page_limit integer) TO authenticated;


--
-- Name: FUNCTION get_module_gallery_sections(target_module_id uuid, sort_mode text, per_chapter_limit integer, chapter_offset integer, chapter_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_module_gallery_sections(target_module_id uuid, sort_mode text, per_chapter_limit integer, chapter_offset integer, chapter_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_module_gallery_sections(target_module_id uuid, sort_mode text, per_chapter_limit integer, chapter_offset integer, chapter_limit integer) TO authenticated;


--
-- Name: FUNCTION get_module_image_keys(target_module_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_module_image_keys(target_module_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_module_image_keys(target_module_id uuid) TO authenticated;


--
-- Name: FUNCTION get_question_bank_availability(selected_chapter_id uuid, selected_topic_id uuid, only_unassigned boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_question_bank_availability(selected_chapter_id uuid, selected_topic_id uuid, only_unassigned boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_question_bank_availability(selected_chapter_id uuid, selected_topic_id uuid, only_unassigned boolean) TO authenticated;


--
-- Name: FUNCTION get_question_bank_availability(target_module_id uuid, selected_chapter_id uuid, selected_topic_id uuid, only_unassigned boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_question_bank_availability(target_module_id uuid, selected_chapter_id uuid, selected_topic_id uuid, only_unassigned boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_question_bank_availability(target_module_id uuid, selected_chapter_id uuid, selected_topic_id uuid, only_unassigned boolean) TO authenticated;


--
-- Name: FUNCTION get_topic_navigation(current_topic_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_topic_navigation(current_topic_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_topic_navigation(current_topic_id uuid) TO authenticated;


--
-- Name: FUNCTION get_trash_image_keys(target_trash_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_trash_image_keys(target_trash_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_trash_image_keys(target_trash_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_trash_image_keys(target_trash_id uuid) TO service_role;


--
-- Name: FUNCTION move_notes_to_trash(chapter_ids uuid[], topic_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.move_notes_to_trash(chapter_ids uuid[], topic_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_notes_to_trash(chapter_ids uuid[], topic_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION move_to_trash(target_type text, target_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.move_to_trash(target_type text, target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_to_trash(target_type text, target_id uuid) TO authenticated;


--
-- Name: FUNCTION move_topic(moved_topic_id uuid, source_chapter_id uuid, target_chapter_id uuid, target_slug text, source_topic_ids uuid[], target_topic_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.move_topic(moved_topic_id uuid, source_chapter_id uuid, target_chapter_id uuid, target_slug text, source_topic_ids uuid[], target_topic_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_topic(moved_topic_id uuid, source_chapter_id uuid, target_chapter_id uuid, target_slug text, source_topic_ids uuid[], target_topic_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION purge_trash_item(target_trash_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_trash_item(target_trash_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_trash_item(target_trash_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.purge_trash_item(target_trash_id uuid) TO service_role;


--
-- Name: FUNCTION reorder_chapters(chapter_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_chapters(chapter_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_chapters(chapter_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION reorder_modules(module_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_modules(module_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_modules(module_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION reorder_topic_images(target_topic_id uuid, image_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_topic_images(target_topic_id uuid, image_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_topic_images(target_topic_id uuid, image_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION reorder_topics(target_chapter_id uuid, topic_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_topics(target_chapter_id uuid, topic_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_topics(target_chapter_id uuid, topic_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION restore_trash_item(target_trash_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.restore_trash_item(target_trash_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_trash_item(target_trash_id uuid) TO authenticated;


--
-- Name: FUNCTION save_question(question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_question(question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_question(question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb) TO authenticated;


--
-- Name: FUNCTION save_question(target_module_id uuid, question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_question(target_module_id uuid, question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_question(target_module_id uuid, question_id uuid, question_content text, question_explanation text, selected_chapter_id uuid, selected_topic_id uuid, options jsonb) TO authenticated;


--
-- Name: FUNCTION sync_chapter_questions_module(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_chapter_questions_module() FROM PUBLIC;


--
-- Name: TABLE chapters; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.chapters TO authenticated;
GRANT ALL ON TABLE public.chapters TO service_role;


--
-- Name: TABLE modules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.modules TO authenticated;
GRANT ALL ON TABLE public.modules TO service_role;


--
-- Name: TABLE question_options; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.question_options TO authenticated;
GRANT ALL ON TABLE public.question_options TO service_role;


--
-- Name: TABLE questions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.questions TO authenticated;
GRANT ALL ON TABLE public.questions TO service_role;


--
-- Name: TABLE study_session_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.study_session_items TO authenticated;
GRANT ALL ON TABLE public.study_session_items TO service_role;


--
-- Name: TABLE study_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.study_sessions TO authenticated;
GRANT ALL ON TABLE public.study_sessions TO service_role;


--
-- Name: TABLE topic_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.topic_images TO authenticated;
GRANT ALL ON TABLE public.topic_images TO service_role;


--
-- Name: TABLE topics; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.topics TO authenticated;
GRANT ALL ON TABLE public.topics TO service_role;


--
-- Name: TABLE trash_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,DELETE ON TABLE public.trash_items TO authenticated;
GRANT ALL ON TABLE public.trash_items TO service_role;


--
-- PostgreSQL database dump complete
--


-- Supabase may configure default API grants. Explicitly remove anonymous
-- access rather than relying on the default ACL of the database used to dump.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules, public.chapters,
  public.topics, public.topic_images, public.questions, public.question_options,
  public.study_sessions, public.study_session_items TO authenticated;
GRANT SELECT, DELETE ON public.trash_items TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
REVOKE ALL ON FUNCTION public.sync_chapter_questions_module() FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
RESET check_function_bodies;
RESET row_security;
RESET search_path;
