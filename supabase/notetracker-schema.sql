


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


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") RETURNS TABLE("storage_key" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_topic_learning"("target_topic_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare created_id bigint;
begin
  insert into public.topic_learning_sessions (
    user_id, module_id, chapter_id, topic_id
  )
  select topic.user_id, chapter.module_id, chapter.id, topic.id
  from public.topics as topic
  join public.chapters as chapter
    on chapter.id = topic.chapter_id and chapter.user_id = topic.user_id
  join public.modules as module
    on module.id = chapter.module_id and module.user_id = topic.user_id
  where topic.id = target_topic_id
    and topic.user_id = (select auth.uid())
    and topic.trash_id is null
    and chapter.trash_id is null
    and module.trash_id is null
  returning id into created_id;

  if created_id is null then
    raise exception 'Temat nie istnieje lub jest niedostępny.';
  end if;
  return created_id;
end;
$$;


ALTER FUNCTION "public"."begin_topic_learning"("target_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid" DEFAULT NULL::"uuid", "selected_topic_id" "uuid" DEFAULT NULL::"uuid", "random_chapter_count" integer DEFAULT 3, "requested_question_count" integer DEFAULT 20) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare created_id uuid; inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
    or not exists (
      select 1 from public.modules
      where id = target_module_id and user_id = (select auth.uid()) and trash_id is null
    )
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, study_mode,
    jsonb_build_object('scope', scope_mode, 'chapterId', selected_chapter_id, 'topicId', selected_topic_id))
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
      and exists (
        select 1 from public.questions as question
        join public.question_options as option on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id
          and question.user_id = (select auth.uid())
          and question.module_id = target_module_id
          and question.trash_id is null
        group by question.id
        having study_mode = 'flashcards' or count(option.id) >= 2
      )
    order by random() limit greatest(1, random_chapter_count)
  ), candidates as (
    select question.id, question.content, question.explanation,
      question.chapter_id, question.topic_id,
      chapter.title as chapter_title, topic.title as topic_title,
      jsonb_agg(jsonb_build_object(
        'id', option.id, 'content', option.content, 'isCorrect', option.is_correct
      ) order by option.position) as option_data
    from public.questions as question
    join public.question_options as option on option.question_id = question.id
      and option.user_id = (select auth.uid())
    left join public.chapters as chapter on chapter.id = question.chapter_id
    left join public.topics as topic on topic.id = question.topic_id
    where question.user_id = (select auth.uid())
      and question.module_id = target_module_id
      and question.trash_id is null
      and (
        scope_mode = 'all'
        or (scope_mode = 'chapter' and question.chapter_id = selected_chapter_id)
        or (scope_mode = 'topic' and question.topic_id = selected_topic_id)
        or (scope_mode = 'unassigned' and question.chapter_id is null and question.topic_id is null)
        or (scope_mode = 'random_chapters' and question.chapter_id in (select id from random_chapters))
      )
    group by question.id, chapter.title, topic.title
    having study_mode = 'flashcards' or count(option.id) >= 2
    order by random() limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items (
    user_id, session_id, question_id, position, question_snapshot,
    options_snapshot, explanation_snapshot, chapter_id_snapshot,
    topic_id_snapshot, chapter_title_snapshot, topic_title_snapshot
  )
  select (select auth.uid()), created_id, id, row_number() over ()::integer,
    content, option_data, explanation, chapter_id, topic_id, chapter_title, topic_title
  from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;
  return created_id;
end;
$$;


ALTER FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  delete from public.modules
  where id = target_module_id and user_id = (select auth.uid());
  if not found then raise exception 'Nie znaleziono modułu.'; end if;
end;
$$;


ALTER FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[], "topic_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer DEFAULT 0, "page_limit" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "topic_id" "uuid", "storage_key" "text", "original_filename" "text", "format" "text", "width" integer, "height" integer, "bytes" bigint, "image_position" bigint, "topic_title" "text", "topic_slug" "text", "chapter_id" "uuid", "chapter_title" "text", "chapter_slug" "text", "chapter_total" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(summary.payload order by summary.position, summary.id), '[]'::jsonb)
  from (
    select chapter.id, chapter.position, jsonb_build_object(
      'id', chapter.id,
      'slug', chapter.slug,
      'title', chapter.title,
      'position', chapter.position,
      'topicsCount', count(topic.id),
      'completedTopicsCount', count(topic.id) filter (where topic.completed),
      'firstIncompleteTopicId', (array_agg(topic.id order by topic.position, topic.id) filter (where not topic.completed))[1],
      'firstIncompleteTopicSlug', (array_agg(topic.slug order by topic.position, topic.id) filter (where not topic.completed))[1]
    ) as payload
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = (select auth.uid())
      and topic.trash_id is null
    where chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
    group by chapter.id
  ) as summary;
$$;


ALTER FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_learning_statistics"("target_module_id" "uuid" DEFAULT NULL::"uuid", "range_days" integer DEFAULT 30, "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  if range_days not in (0, 7, 30, 90)
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name
    )
    or (target_module_id is not null and not exists (
      select 1 from public.modules
      where id = target_module_id
        and user_id = (select auth.uid())
        and trash_id is null
    ))
  then
    raise exception 'Nieprawidłowe filtry statystyk nauki.';
  end if;

  with recursive
  params as (
    select timezone(timezone_name, now())::date as today,
      case
        when range_days = 0 then null
        else timezone(timezone_name, now())::date - (range_days - 1)
      end as cutoff
  ), eligible_learning as (
    select session.*,
      timezone(timezone_name, session.started_at)::date as learning_date
    from public.topic_learning_sessions as session
    where session.user_id = (select auth.uid())
      and session.active_duration_seconds > 0
      and (target_module_id is null or session.module_id = target_module_id)
  ), bounded_learning as (
    select session.* from eligible_learning as session, params
    where params.cutoff is null or session.learning_date >= params.cutoff
  ), all_learning_dates as (
    select distinct learning_date from eligible_learning
  ), numbered_dates as (
    select learning_date,
      learning_date - (row_number() over (order by learning_date))::integer as island
    from all_learning_dates
  ), streaks as (
    select min(learning_date) as started_on,
      max(learning_date) as ended_on,
      count(*)::integer as days
    from numbered_dates
    group by island
  ), first_date as (
    select case
      when range_days > 0 then (select cutoff from params)
      else coalesce(
        (select min(learning_date) from all_learning_dates),
        (select today from params)
      )
    end as value
  ), calendar as (
    select generate_series(
      (select value from first_date),
      (select today from params),
      interval '1 day'
    )::date as day
  ), daily as (
    select calendar.day,
      coalesce(sum(session.active_duration_seconds), 0)::integer as duration_seconds,
      count(distinct session.topic_id)::integer as topics
    from calendar
    left join bounded_learning as session on session.learning_date = calendar.day
    group by calendar.day
  ), topic_progress as (
    select topic.id, topic.chapter_id, chapter.module_id,
      topic.title, topic.position, topic.completed
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id and chapter.user_id = topic.user_id
    join public.modules as module
      on module.id = chapter.module_id and module.user_id = topic.user_id
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
      and chapter.trash_id is null
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
  ), chapter_progress as (
    select chapter.id, chapter.module_id, chapter.title, chapter.position,
      count(topic.id)::integer as topics,
      count(topic.id) filter (where topic.completed)::integer as completed_topics
    from public.chapters as chapter
    join public.modules as module
      on module.id = chapter.module_id and module.user_id = chapter.user_id
    left join topic_progress as topic on topic.chapter_id = chapter.id
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
    group by chapter.id, chapter.module_id, chapter.title, chapter.position
  ), module_progress as (
    select module.id, module.name, module.position,
      count(distinct chapter.id)::integer as chapters,
      count(distinct chapter.id) filter (
        where chapter.topics > 0 and chapter.completed_topics = chapter.topics
      )::integer as completed_chapters,
      coalesce(sum(chapter.topics), 0)::integer as topics,
      coalesce(sum(chapter.completed_topics), 0)::integer as completed_topics
    from public.modules as module
    left join chapter_progress as chapter on chapter.module_id = module.id
    where module.user_id = (select auth.uid()) and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
    group by module.id, module.name, module.position
  ), chapter_learning as (
    select chapter_id,
      sum(active_duration_seconds)::integer as duration_seconds,
      count(*)::integer as visits,
      count(distinct topic_id)::integer as visited_topics,
      max(last_active_at) as last_studied_at
    from bounded_learning group by chapter_id
  ), topic_learning as (
    select topic_id,
      sum(active_duration_seconds)::integer as duration_seconds,
      count(*)::integer as visits,
      max(last_active_at) as last_studied_at
    from bounded_learning group by topic_id
  ), module_learning as (
    select module_id,
      sum(active_duration_seconds)::integer as duration_seconds,
      count(*)::integer as visits,
      count(distinct topic_id)::integer as visited_topics,
      max(last_active_at) as last_studied_at
    from bounded_learning group by module_id
  ), week_progress as (
    select coalesce(sum(session.active_duration_seconds), 0)::integer as seconds
    from public.topic_learning_sessions as session, params
    where session.user_id = (select auth.uid())
      and timezone(timezone_name, session.started_at)::date
        >= date_trunc('week', params.today)::date
      and timezone(timezone_name, session.started_at)::date <= params.today
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'durationSeconds', coalesce((select sum(active_duration_seconds) from bounded_learning), 0),
      'activeDays', (select count(*) from daily where duration_seconds > 0),
      'visits', (select count(*) from bounded_learning),
      'visitedTopics', (select count(distinct topic_id) from bounded_learning),
      'totalTopics', coalesce((select sum(topics) from module_progress), 0),
      'completedTopics', coalesce((select sum(completed_topics) from module_progress), 0),
      'totalChapters', coalesce((select sum(chapters) from module_progress), 0),
      'completedChapters', coalesce((select sum(completed_chapters) from module_progress), 0),
      'currentStreak', coalesce((
        select days from streaks, params
        where ended_on = (select max(learning_date) from all_learning_dates)
          and ended_on >= params.today - 1
      ), 0),
      'longestStreak', coalesce((select max(days) from streaks), 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'durationSeconds', duration_seconds, 'topics', topics
    ) order by day) from daily), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', progress.id, 'name', progress.name,
      'chapters', progress.chapters,
      'completedChapters', progress.completed_chapters,
      'topics', progress.topics,
      'completedTopics', progress.completed_topics,
      'visitedTopics', coalesce(activity.visited_topics, 0),
      'visits', coalesce(activity.visits, 0),
      'durationSeconds', coalesce(activity.duration_seconds, 0),
      'lastStudiedAt', activity.last_studied_at
    ) order by progress.position) from module_progress as progress
    left join module_learning as activity on activity.module_id = progress.id), '[]'::jsonb),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object(
      'id', progress.id, 'moduleId', progress.module_id, 'title', progress.title,
      'topics', progress.topics,
      'completedTopics', progress.completed_topics,
      'visitedTopics', coalesce(activity.visited_topics, 0),
      'visits', coalesce(activity.visits, 0),
      'durationSeconds', coalesce(activity.duration_seconds, 0),
      'lastStudiedAt', activity.last_studied_at
    ) order by progress.position) from chapter_progress as progress
    left join chapter_learning as activity on activity.chapter_id = progress.id), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', progress.id, 'chapterId', progress.chapter_id, 'title', progress.title,
      'completed', progress.completed,
      'visits', coalesce(activity.visits, 0),
      'durationSeconds', coalesce(activity.duration_seconds, 0),
      'lastStudiedAt', activity.last_studied_at
    ) order by progress.position) from topic_progress as progress
    left join topic_learning as activity on activity.topic_id = progress.id), '[]'::jsonb),
    'weeklyDurationSeconds', (select seconds from week_progress)
  ) into result;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_learning_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with owned_chapters as (
    select id, position
    from public.chapters
    where user_id = (select auth.uid())
      and module_id = target_module_id
      and trash_id is null
  ), owned_topics as (
    select topic.id, topic.chapter_id, topic.completed, topic.position
    from public.topics as topic
    join owned_chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid()) and topic.trash_id is null
  ), next_topic as (
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
    'completedTopics', (select count(*) from owned_topics where completed),
    'completedChapters', (
      select count(*) from owned_chapters as chapter
      where exists (select 1 from owned_topics where chapter_id = chapter.id)
        and not exists (select 1 from owned_topics where chapter_id = chapter.id and not completed)
    ),
    'nextTopic', (
      select jsonb_build_object('chapterId', chapter_id, 'id', id) from next_topic
    )
  );
$$;


ALTER FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer DEFAULT 0, "page_limit" integer DEFAULT 13) RETURNS TABLE("id" "uuid", "topic_id" "uuid", "storage_key" "text", "original_filename" "text", "format" "text", "width" integer, "height" integer, "bytes" bigint, "image_position" bigint, "topic_title" "text", "topic_slug" "text", "chapter_id" "uuid", "chapter_title" "text", "chapter_slug" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer DEFAULT 4, "chapter_offset" integer DEFAULT 0, "chapter_limit" integer DEFAULT 7) RETURNS TABLE("id" "uuid", "topic_id" "uuid", "storage_key" "text", "original_filename" "text", "format" "text", "width" integer, "height" integer, "bytes" bigint, "image_position" bigint, "topic_title" "text", "topic_slug" "text", "chapter_id" "uuid", "chapter_title" "text", "chapter_slug" "text", "chapter_total" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") RETURNS TABLE("storage_key" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_module_summaries"("target_module_id" "uuid" DEFAULT NULL::"uuid", "target_module_slug" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "is_pinned" boolean, "module_position" integer, "chapters_count" integer, "completed_chapters_count" integer, "topics_count" integer, "completed_topics_count" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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
  select module.id, module.slug, module.name, module.is_pinned,
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
  group by module.id, module.slug, module.name, module.is_pinned,
    module.position
  order by module.is_pinned desc, lower(module.name), module.name, module.id;
$$;


ALTER FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_progress_overview_statistics"("target_module_id" "uuid" DEFAULT NULL::"uuid", "range_days" integer DEFAULT 30, "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select public.get_progress_statistics(
    target_module_id,
    range_days,
    timezone_name
  ) - 'topics';
$$;


ALTER FUNCTION "public"."get_progress_overview_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_progress_statistics"("target_module_id" "uuid" DEFAULT NULL::"uuid", "range_days" integer DEFAULT 30, "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  if range_days not in (0, 7, 30, 90)
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name
    )
    or (target_module_id is not null and not exists (
      select 1 from public.modules
      where id = target_module_id
        and user_id = (select auth.uid())
        and trash_id is null
    ))
  then
    raise exception 'Nieprawidłowe filtry statystyk postępu.';
  end if;

  with recursive
  params as (
    select timezone(timezone_name, now())::date as today,
      case
        when range_days = 0 then null
        else timezone(timezone_name, now())::date - (range_days - 1)
      end as cutoff
  ), owned_topics as (
    select topic.id, topic.chapter_id, chapter.module_id,
      topic.title, topic.position, topic.completed, topic.first_completed_at
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id and chapter.user_id = topic.user_id
    join public.modules as module
      on module.id = chapter.module_id and module.user_id = topic.user_id
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
      and chapter.trash_id is null
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
  ), chapter_progress as (
    select chapter.id, chapter.module_id, chapter.title, chapter.position,
      count(topic.id)::integer as topics,
      count(topic.id) filter (where topic.completed)::integer as completed_topics
    from public.chapters as chapter
    join public.modules as module
      on module.id = chapter.module_id and module.user_id = chapter.user_id
    left join owned_topics as topic on topic.chapter_id = chapter.id
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
    group by chapter.id, chapter.module_id, chapter.title, chapter.position
  ), module_progress as (
    select module.id, module.name, module.position,
      count(chapter.id)::integer as chapters,
      count(chapter.id) filter (
        where chapter.topics > 0 and chapter.completed_topics = chapter.topics
      )::integer as completed_chapters,
      coalesce(sum(chapter.topics), 0)::integer as topics,
      coalesce(sum(chapter.completed_topics), 0)::integer as completed_topics
    from public.modules as module
    left join chapter_progress as chapter on chapter.module_id = module.id
    where module.user_id = (select auth.uid())
      and module.trash_id is null
      and (target_module_id is null or module.id = target_module_id)
    group by module.id, module.name, module.position
  ), completion_dates as (
    select distinct timezone(timezone_name, first_completed_at)::date as completed_date
    from owned_topics
    where first_completed_at is not null
  ), numbered_dates as (
    select completed_date,
      completed_date - (row_number() over (order by completed_date))::integer as island
    from completion_dates
  ), streaks as (
    select min(completed_date) as started_on,
      max(completed_date) as ended_on,
      count(*)::integer as days
    from numbered_dates group by island
  ), first_date as (
    select case
      when range_days > 0 then (select cutoff from params)
      else coalesce(
        (select min(completed_date) from completion_dates),
        (select today from params)
      )
    end as value
  ), calendar as (
    select generate_series(
      (select value from first_date),
      (select today from params),
      interval '1 day'
    )::date as day
  ), daily as (
    select calendar.day,
      count(topic.id)::integer as completed_topics
    from calendar
    left join owned_topics as topic
      on timezone(timezone_name, topic.first_completed_at)::date = calendar.day
    group by calendar.day
  ), weekly_totals as (
    select date_trunc(
        'week', timezone(timezone_name, first_completed_at)
      )::date as week_started_on,
      count(*)::integer as completed_topics
    from owned_topics
    where first_completed_at is not null
    group by week_started_on
  ), weekly as (
    select
      coalesce((
        select completed_topics from weekly_totals, params
        where week_started_on = date_trunc('week', params.today)::date
      ), 0)::integer as completed_topics,
      coalesce((select max(completed_topics) from weekly_totals), 0)::integer
        as best_completed_topics
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'totalModules', count(*),
      'completedModules', count(*) filter (
        where topics > 0 and completed_topics = topics
      ),
      'totalChapters', coalesce(sum(chapters), 0),
      'completedChapters', coalesce(sum(completed_chapters), 0),
      'totalTopics', coalesce(sum(topics), 0),
      'completedTopics', coalesce(sum(completed_topics), 0),
      'remainingTopics', coalesce(sum(topics - completed_topics), 0),
      'currentStreak', coalesce((
        select days from streaks, params
        where ended_on = (select max(completed_date) from completion_dates)
          and ended_on >= params.today - 1
      ), 0),
      'longestStreak', coalesce((select max(days) from streaks), 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'completedTopics', completed_topics
    ) order by day) from daily), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name,
      'chapters', chapters, 'completedChapters', completed_chapters,
      'topics', topics, 'completedTopics', completed_topics
    ) order by position) from module_progress), '[]'::jsonb),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'moduleId', module_id, 'title', title,
      'topics', topics, 'completedTopics', completed_topics
    ) order by position) from chapter_progress), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'chapterId', chapter_id, 'title', title,
      'completed', completed, 'firstCompletedAt', first_completed_at
    ) order by position) from owned_topics), '[]'::jsonb),
    'weeklyGoal', jsonb_build_object(
      'topics', coalesce((
        select weekly_topics from public.study_goals
        where user_id = (select auth.uid())
      ), 5),
      'completedTopics', (select completed_topics from weekly),
      'bestCompletedTopics', (select best_completed_topics from weekly)
    )
  ) into result
  from module_progress;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_progress_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_progress_topics_page"("target_module_id" "uuid", "sort_mode" "text" DEFAULT 'chapter'::"text", "page_size" integer DEFAULT 30, "after_sort_rank" integer DEFAULT NULL::integer, "after_chapter_position" bigint DEFAULT NULL::bigint, "after_topic_position" bigint DEFAULT NULL::bigint, "after_topic_id" "uuid" DEFAULT NULL::"uuid", "completion_filter" "text" DEFAULT 'all'::"text") RETURNS TABLE("topic_id" "uuid", "chapter_id" "uuid", "chapter_title" "text", "title" "text", "completed" boolean, "first_completed_at" timestamp with time zone, "sort_rank" integer, "chapter_position" bigint, "topic_position" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
begin
  if sort_mode not in ('chapter', 'completed', 'incomplete')
    or completion_filter not in ('all', 'completed', 'incomplete')
    or page_size not between 1 and 50
    or (after_topic_id is not null and (
      after_sort_rank is null
      or after_chapter_position is null
      or after_topic_position is null
    ))
  then
    raise exception 'Nieprawidłowe parametry listy tematów.';
  end if;

  return query
  with ranked_topics as (
    select topic.id as topic_id,
      chapter.id as chapter_id,
      chapter.title as chapter_title,
      topic.title,
      topic.completed,
      topic.first_completed_at,
      case sort_mode
        when 'completed' then case when topic.completed then 0 else 1 end
        when 'incomplete' then case when topic.completed then 1 else 0 end
        else 0
      end as sort_rank,
      chapter.position as chapter_position,
      topic.position as topic_position
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    join public.modules as module
      on module.id = chapter.module_id
      and module.user_id = topic.user_id
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
      and chapter.trash_id is null
      and topic.trash_id is null
      and (
        completion_filter = 'all'
        or topic.completed = (completion_filter = 'completed')
      )
  )
  select ranked.topic_id,
    ranked.chapter_id,
    ranked.chapter_title,
    ranked.title,
    ranked.completed,
    ranked.first_completed_at,
    ranked.sort_rank,
    ranked.chapter_position,
    ranked.topic_position
  from ranked_topics as ranked
  where after_topic_id is null
    or (
      ranked.sort_rank,
      ranked.chapter_position,
      ranked.topic_position,
      ranked.topic_id
    ) > (
      after_sort_rank,
      after_chapter_position,
      after_topic_position,
      after_topic_id
    )
  order by ranked.sort_rank,
    ranked.chapter_position,
    ranked.topic_position,
    ranked.topic_id
  limit page_size + 1;
end;
$$;


ALTER FUNCTION "public"."get_progress_topics_page"("target_module_id" "uuid", "sort_mode" "text", "page_size" integer, "after_sort_rank" integer, "after_chapter_position" bigint, "after_topic_position" bigint, "after_topic_id" "uuid", "completion_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid" DEFAULT NULL::"uuid", "selected_topic_id" "uuid" DEFAULT NULL::"uuid", "only_unassigned" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_study_statistics"("target_module_id" "uuid" DEFAULT NULL::"uuid", "range_days" integer DEFAULT 30, "study_mode" "text" DEFAULT NULL::"text", "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  if range_days not in (0, 7, 30, 90)
    or (study_mode is not null and study_mode not in ('flashcards', 'test'))
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_name)
    or (target_module_id is not null and not exists (
      select 1 from public.modules
      where id = target_module_id and user_id = (select auth.uid()) and trash_id is null
    ))
  then raise exception 'Nieprawidłowe filtry statystyk.'; end if;

  with recursive
  params as (
    select timezone(timezone_name, now())::date as today,
      case when range_days = 0 then null
        else timezone(timezone_name, now())::date - (range_days - 1) end as cutoff
  ), eligible_sessions as (
    select session.*,
      timezone(timezone_name, session.started_at)::date as study_date
    from public.study_sessions as session, params
    where session.user_id = (select auth.uid())
      and session.trash_id is null
      and (target_module_id is null or session.module_id = target_module_id)
      and (study_mode is null or session.mode = study_mode)
  ), item_rows as (
    select item.*, session.module_id, session.mode, session.status,
      coalesce(timezone(timezone_name, item.answered_at)::date, session.study_date) as study_date,
      (item.result in ('correct', 'remembered')) as successful
    from public.study_session_items as item
    join eligible_sessions as session on session.id = item.session_id
    where item.result is not null
  ), all_activity_dates as (
    select distinct study_date from item_rows where study_date is not null
  ), numbered_dates as (
    select study_date,
      study_date - (row_number() over (order by study_date))::integer as island
    from all_activity_dates
  ), streaks as (
    select min(study_date) as started_on, max(study_date) as ended_on, count(*)::integer as days
    from numbered_dates group by island
  ), session_metrics as (
    select session.id, session.module_id, session.mode, session.status,
      session.started_at, session.completed_at, session.configuration, session.study_date,
      count(item.id) filter (where item.result is not null)::integer as answers,
      count(item.id) filter (where item.successful)::integer as successful,
      case
        when coalesce(sum(item.active_duration_seconds), 0) > 0
          then sum(item.active_duration_seconds)::integer
        when session.completed_at is not null
          then least(14400, greatest(0, extract(epoch from session.completed_at - session.started_at)::integer))
        else 0
      end as duration_seconds
    from eligible_sessions as session
    left join item_rows as item on item.session_id = session.id
    group by session.id, session.module_id, session.mode, session.status,
      session.started_at, session.completed_at, session.configuration, session.study_date
  ), weekly_session_metrics as (
    select session.id,
      timezone(timezone_name, session.started_at)::date as study_date,
      case
        when coalesce(sum(item.active_duration_seconds), 0) > 0
          then sum(item.active_duration_seconds)::integer
        when session.completed_at is not null
          then least(14400, greatest(0, extract(epoch from session.completed_at - session.started_at)::integer))
        else 0
      end as duration_seconds
    from public.study_sessions as session
    left join public.study_session_items as item
      on item.session_id = session.id and item.result is not null
    where session.user_id = (select auth.uid()) and session.trash_id is null
    group by session.id, session.started_at, session.completed_at
  ), bounded_sessions as (
    select session.* from session_metrics as session, params
    where params.cutoff is null or session.study_date >= params.cutoff
  ), previous_sessions as (
    select session.* from session_metrics as session, params
    where params.cutoff is not null
      and session.study_date < params.cutoff
      and session.study_date >= params.cutoff - range_days
  ), bounded_items as (
    select item.* from item_rows as item, params
    where params.cutoff is null or item.study_date >= params.cutoff
  ), first_date as (
    select case
      when range_days > 0 then (select cutoff from params)
      else coalesce((select min(study_date) from all_activity_dates), (select today from params))
    end as value
  ), calendar as (
    select generate_series(
      (select value from first_date), (select today from params), interval '1 day'
    )::date as day
  ), daily as (
    select calendar.day,
      count(distinct item.session_id)::integer as sessions,
      count(item.id)::integer as answers,
      count(item.id) filter (where item.successful)::integer as successful,
      coalesce((select sum(duration_seconds) from bounded_sessions where study_date = calendar.day), 0)::integer as duration_seconds
    from calendar
    left join bounded_items as item on item.study_date = calendar.day
    group by calendar.day
  ), areas as (
    select coalesce(item.chapter_id_snapshot::text, 'unassigned') as chapter_id,
      coalesce(item.chapter_title_snapshot, 'Nieprzypisane') as chapter_title,
      item.topic_id_snapshot::text as topic_id,
      item.topic_title_snapshot as topic_title,
      count(*)::integer as answers,
      count(*) filter (where item.successful)::integer as successful,
      max(item.answered_at) as last_studied_at
    from bounded_items as item
    group by item.chapter_id_snapshot, item.chapter_title_snapshot,
      item.topic_id_snapshot, item.topic_title_snapshot
  ), module_metrics as (
    select module.id, module.name,
      count(item.id)::integer as answers,
      count(item.id) filter (where item.successful)::integer as successful,
      max(item.answered_at) as last_studied_at
    from public.modules as module
    left join bounded_items as item on item.module_id = module.id
    where module.user_id = (select auth.uid()) and module.trash_id is null
    group by module.id, module.name, module.position
    order by module.position
  ), current_summary as (
    select count(*) filter (where status = 'completed')::integer as completed_sessions,
      coalesce(sum(answers), 0)::integer as answers,
      coalesce(sum(successful), 0)::integer as successful,
      coalesce(sum(duration_seconds), 0)::integer as duration_seconds
    from bounded_sessions
  ), previous_summary as (
    select coalesce(sum(answers), 0)::integer as answers,
      coalesce(sum(successful), 0)::integer as successful
    from previous_sessions
  ), week_progress as (
    select coalesce(sum(duration_seconds), 0)::integer as duration_seconds
    from weekly_session_metrics, params
    where study_date >= date_trunc('week', params.today)::date
      and study_date <= params.today
  ), busiest_day as (
    select day, answers from daily order by answers desc, day desc limit 1
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'completedSessions', current_summary.completed_sessions,
      'answers', current_summary.answers,
      'successful', current_summary.successful,
      'accuracy', case when current_summary.answers = 0 then 0 else round(current_summary.successful * 100.0 / current_summary.answers)::integer end,
      'previousAccuracy', case when previous_summary.answers = 0 then null else round(previous_summary.successful * 100.0 / previous_summary.answers)::integer end,
      'durationSeconds', current_summary.duration_seconds,
      'activeDays', (select count(*) from daily where answers > 0),
      'currentStreak', coalesce((select days from streaks, params where ended_on = (select max(study_date) from all_activity_dates) and ended_on >= params.today - 1), 0),
      'longestStreak', coalesce((select max(days) from streaks), 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'sessions', sessions, 'answers', answers,
      'successful', successful, 'durationSeconds', duration_seconds
    ) order by day) from daily), '[]'::jsonb),
    'sessionTrend', coalesce((select jsonb_agg(entry order by started_at) from (
      select jsonb_build_object(
        'id', id, 'date', started_at, 'mode', mode, 'answers', answers,
        'accuracy', case when answers = 0 then 0 else round(successful * 100.0 / answers)::integer end
      ) as entry, started_at from bounded_sessions
      where answers > 0 order by started_at desc limit 50
    ) trend), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
      'chapterId', chapter_id, 'chapterTitle', chapter_title,
      'topicId', topic_id, 'topicTitle', topic_title, 'answers', answers,
      'accuracy', round(successful * 100.0 / answers)::integer,
      'lastStudiedAt', last_studied_at
    ) order by (successful * 1.0 / answers), answers desc) from areas), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'answers', answers,
      'accuracy', case when answers = 0 then 0 else round(successful * 100.0 / answers)::integer end,
      'lastStudiedAt', last_studied_at
    )) from module_metrics), '[]'::jsonb),
    'recentSessions', coalesce((select jsonb_agg(entry order by started_at desc) from (
      select jsonb_build_object(
        'id', recent_session.id,
        'moduleId', recent_session.module_id,
        'mode', recent_session.mode,
        'status', recent_session.status,
        'moduleName', module.name,
        'startedAt', recent_session.started_at,
        'completedAt', recent_session.completed_at,
        'answers', recent_session.answers,
        'accuracy', case when recent_session.answers = 0 then 0 else round(recent_session.successful * 100.0 / recent_session.answers)::integer end,
        'durationSeconds', recent_session.duration_seconds
      ) as entry, recent_session.started_at
      from bounded_sessions as recent_session
      join public.modules as module on module.id = recent_session.module_id
      order by recent_session.started_at desc limit 5
    ) recent), '[]'::jsonb),
    'records', jsonb_build_object(
      'bestAccuracy', coalesce((select max(round(successful * 100.0 / answers)::integer) from bounded_sessions where answers >= 5), 0),
      'mostAnswersInDay', coalesce((select answers from busiest_day), 0),
      'mostActiveDate', (select day from busiest_day)
    ),
    'weeklyGoal', jsonb_build_object(
      'minutes', coalesce((select weekly_minutes from public.study_goals where user_id = (select auth.uid())), 150),
      'completedSeconds', (select duration_seconds from week_progress)
    )
  ) into result
  from current_summary cross join previous_summary;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with ordered_topics as (
    select topic.id as topic_id, topic.slug as topic_slug, topic.title as topic_title,
      chapter.id as chapter_id, chapter.slug as chapter_slug, chapter.title as chapter_title,
      row_number() over (order by chapter.position, chapter.id, topic.position, topic.id) as topic_index,
      count(*) over () as total
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
      and chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and topic.trash_id is null
      and chapter.trash_id is null
  ), current_topic as (
    select * from ordered_topics where topic_id = current_topic_id
  )
  select jsonb_build_object(
    'currentIndex', current_topic.topic_index - 1,
    'total', current_topic.total,
    'previous', (
      select jsonb_build_object(
        'chapterId', item.chapter_id, 'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title, 'topicId', item.topic_id,
        'topicSlug', item.topic_slug, 'topicTitle', item.topic_title
      ) from ordered_topics as item where item.topic_index = current_topic.topic_index - 1
    ),
    'next', (
      select jsonb_build_object(
        'chapterId', item.chapter_id, 'chapterSlug', item.chapter_slug,
        'chapterTitle', item.chapter_title, 'topicId', item.topic_id,
        'topicSlug', item.topic_slug, 'topicTitle', item.topic_title
      ) from ordered_topics as item where item.topic_index = current_topic.topic_index + 1
    )
  ) from current_topic;
$$;


ALTER FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") RETURNS TABLE("storage_key" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select * from private.get_trash_image_keys(target_trash_id);
$$;


ALTER FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare item_id uuid;
begin
  foreach item_id in array chapter_ids loop perform public.move_to_trash('chapter', item_id); end loop;
  foreach item_id in array topic_ids loop
    if exists (select 1 from public.topics where id = item_id and user_id = (select auth.uid()) and trash_id is null)
      then perform public.move_to_trash('topic', item_id); end if;
  end loop;
end; $$;


ALTER FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.move_to_trash(target_type, target_id);
$$;


ALTER FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.purge_trash_item(target_trash_id);
$$;


ALTER FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_topic_learning"("target_session_id" bigint, "total_active_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if total_active_seconds < 0 or total_active_seconds > 28800 then
    raise exception 'Nieprawidłowy czas nauki.';
  end if;

  update public.topic_learning_sessions
  set active_duration_seconds = greatest(
        active_duration_seconds,
        least(
          total_active_seconds,
          extract(epoch from now() - started_at)::integer
        )
      ),
      last_active_at = now()
  where id = target_session_id
    and user_id = (select auth.uid());

  if not found then
    raise exception 'Sesja nauki nie istnieje lub jest niedostępna.';
  end if;
end;
$$;


ALTER FUNCTION "public"."record_topic_learning"("target_session_id" bigint, "total_active_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.restore_trash_item(target_trash_id);
$$;


ALTER FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.topics
  set content = new_content
  where id = target_topic_id
    and chapter_id = target_chapter_id
    and user_id = (select auth.uid())
    and trash_id is null
    and content = expected_content;
  return found;
end;
$$;


ALTER FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_module_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_module_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_chapter_questions_module"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."sync_chapter_questions_module"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_topic_first_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    new.first_completed_at = case when new.completed then now() else null end;
  elsif old.first_completed_at is not null then
    new.first_completed_at = old.first_completed_at;
  elsif new.completed then
    new.first_completed_at = now();
  else
    new.first_completed_at = null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_topic_first_completed_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chapters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "trash_id" "uuid",
    CONSTRAINT "chapters_position_nonnegative" CHECK (("position" >= 0)),
    CONSTRAINT "chapters_title_not_blank" CHECK (("char_length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."chapters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trash_id" "uuid",
    "slug" "text" DEFAULT ''::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    CONSTRAINT "modules_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 120))),
    CONSTRAINT "modules_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_correct" boolean DEFAULT false NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "question_options_content_not_blank" CHECK (("btrim"("content") <> ''::"text")),
    CONSTRAINT "question_options_position_check" CHECK (("position" > 0))
);


ALTER TABLE "public"."question_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "chapter_id" "uuid",
    "topic_id" "uuid",
    "content" "text" NOT NULL,
    "explanation" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "module_id" "uuid" NOT NULL,
    "trash_id" "uuid",
    CONSTRAINT "questions_content_not_blank" CHECK (("btrim"("content") <> ''::"text")),
    CONSTRAINT "questions_explanation_not_blank" CHECK ((("explanation" IS NULL) OR ("btrim"("explanation") <> ''::"text")))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_goals" (
    "user_id" "uuid" NOT NULL,
    "weekly_minutes" integer DEFAULT 150 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weekly_topics" integer DEFAULT 5 NOT NULL,
    "weekly_topics_enabled" boolean DEFAULT true NOT NULL,
    "review_reminders_enabled" boolean DEFAULT false NOT NULL,
    "review_reminder_interval_days" integer DEFAULT 7 NOT NULL,
    "last_review_reminder_at" timestamp with time zone,
    CONSTRAINT "study_goals_review_reminder_interval_days_check" CHECK (("review_reminder_interval_days" = ANY (ARRAY[1, 2, 3, 7, 14, 30]))),
    CONSTRAINT "study_goals_weekly_minutes_check" CHECK ((("weekly_minutes" >= 15) AND ("weekly_minutes" <= 10080))),
    CONSTRAINT "study_goals_weekly_topics_check" CHECK ((("weekly_topics" >= 1) AND ("weekly_topics" <= 1000)))
);


ALTER TABLE "public"."study_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_session_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid",
    "position" integer NOT NULL,
    "question_snapshot" "text" NOT NULL,
    "options_snapshot" "jsonb" NOT NULL,
    "explanation_snapshot" "text",
    "selected_option_id" "uuid",
    "result" "text",
    "answered_at" timestamp with time zone,
    "chapter_id_snapshot" "uuid",
    "topic_id_snapshot" "uuid",
    "chapter_title_snapshot" "text",
    "topic_title_snapshot" "text",
    "active_duration_seconds" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "study_session_items_active_duration_check" CHECK ((("active_duration_seconds" >= 0) AND ("active_duration_seconds" <= 86400))),
    CONSTRAINT "study_session_items_position_check" CHECK (("position" > 0)),
    CONSTRAINT "study_session_items_result_check" CHECK ((("result" IS NULL) OR ("result" = ANY (ARRAY['remembered'::"text", 'forgotten'::"text", 'correct'::"text", 'incorrect'::"text"]))))
);


ALTER TABLE "public"."study_session_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mode" "text" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "module_id" "uuid" NOT NULL,
    "trash_id" "uuid",
    CONSTRAINT "study_sessions_mode_check" CHECK (("mode" = ANY (ARRAY['flashcards'::"text", 'test'::"text"]))),
    CONSTRAINT "study_sessions_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."study_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "storage_key" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "format" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "bytes" bigint NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trash_id" "uuid",
    CONSTRAINT "topic_images_bytes_check" CHECK (("bytes" > 0)),
    CONSTRAINT "topic_images_format_check" CHECK (("format" = 'webp'::"text")),
    CONSTRAINT "topic_images_height_check" CHECK (("height" > 0)),
    CONSTRAINT "topic_images_width_check" CHECK (("width" > 0))
);


ALTER TABLE "public"."topic_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_learning_sessions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "chapter_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_duration_seconds" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "topic_learning_sessions_duration_check" CHECK ((("active_duration_seconds" >= 0) AND ("active_duration_seconds" <= 28800)))
);


ALTER TABLE "public"."topic_learning_sessions" OWNER TO "postgres";


ALTER TABLE "public"."topic_learning_sessions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."topic_learning_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chapter_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{"type": "doc", "content": [{"type": "paragraph"}]}'::"jsonb" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text" NOT NULL,
    "trash_id" "uuid",
    "first_completed_at" timestamp with time zone,
    CONSTRAINT "topics_content_is_object" CHECK (("jsonb_typeof"("content") = 'object'::"text")),
    CONSTRAINT "topics_position_nonnegative" CHECK (("position" >= 0)),
    CONSTRAINT "topics_title_not_blank" CHECK (("char_length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trash_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purge_after" timestamp with time zone DEFAULT ("now"() + '1 day'::interval) NOT NULL,
    CONSTRAINT "trash_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['module'::"text", 'chapter'::"text", 'topic'::"text", 'image'::"text", 'question'::"text", 'study_session'::"text"])))
);


ALTER TABLE "public"."trash_items" OWNER TO "postgres";


ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_id_users_id_unique" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_user_id_slug_key" UNIQUE ("user_id", "slug");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_id_user_id_key" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_position_key" UNIQUE ("question_id", "position");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_goals"
    ADD CONSTRAINT "study_goals_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."study_session_items"
    ADD CONSTRAINT "study_session_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_session_items"
    ADD CONSTRAINT "study_session_items_session_id_position_key" UNIQUE ("session_id", "position");



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_storage_key_key" UNIQUE ("storage_key");



ALTER TABLE ONLY "public"."topic_learning_sessions"
    ADD CONSTRAINT "topic_learning_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_chapter_id_slug_key" UNIQUE ("chapter_id", "slug");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trash_items"
    ADD CONSTRAINT "trash_items_item_type_item_id_key" UNIQUE ("item_type", "item_id");



ALTER TABLE ONLY "public"."trash_items"
    ADD CONSTRAINT "trash_items_pkey" PRIMARY KEY ("id");



CREATE INDEX "chapters_active_idx" ON "public"."chapters" USING "btree" ("module_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "chapters_module_user_position_id_idx" ON "public"."chapters" USING "btree" ("module_id", "user_id", "position", "id");



CREATE INDEX "chapters_title_search_idx" ON "public"."chapters" USING "gin" ("lower"("title") "extensions"."gin_trgm_ops");



CREATE INDEX "chapters_title_trgm_idx" ON "public"."chapters" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "chapters_user_position_id_idx" ON "public"."chapters" USING "btree" ("user_id", "position", "id");



CREATE UNIQUE INDEX "chapters_user_title_unique_idx" ON "public"."chapters" USING "btree" ("user_id", "lower"("btrim"("title")));



CREATE INDEX "modules_active_idx" ON "public"."modules" USING "btree" ("user_id", "position", "id") WHERE ("trash_id" IS NULL);


CREATE INDEX "modules_user_pinned_name_idx" ON "public"."modules" USING "btree" ("user_id", "is_pinned" DESC, "lower"("name"), "id") WHERE ("trash_id" IS NULL);



CREATE UNIQUE INDEX "modules_user_normalized_name_idx" ON "public"."modules" USING "btree" ("user_id", "lower"("btrim"("name"))) WHERE ("trash_id" IS NULL);



CREATE INDEX "modules_user_position_id_idx" ON "public"."modules" USING "btree" ("user_id", "position", "id");



CREATE UNIQUE INDEX "modules_user_slug_idx" ON "public"."modules" USING "btree" ("user_id", "slug") WHERE ("trash_id" IS NULL);



CREATE INDEX "question_options_user_question_position_idx" ON "public"."question_options" USING "btree" ("user_id", "question_id", "position");



CREATE INDEX "questions_active_idx" ON "public"."questions" USING "btree" ("module_id", "created_at" DESC) WHERE ("trash_id" IS NULL);



CREATE INDEX "questions_user_chapter_topic_idx" ON "public"."questions" USING "btree" ("user_id", "chapter_id", "topic_id");



CREATE INDEX "questions_user_created_idx" ON "public"."questions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "questions_user_module_created_idx" ON "public"."questions" USING "btree" ("user_id", "module_id", "created_at" DESC);



CREATE INDEX "study_session_items_session_answered_idx" ON "public"."study_session_items" USING "btree" ("session_id", "answered_at") WHERE ("answered_at" IS NOT NULL);



CREATE INDEX "study_session_items_user_answered_idx" ON "public"."study_session_items" USING "btree" ("user_id", "answered_at") WHERE ("answered_at" IS NOT NULL);



CREATE INDEX "study_session_items_user_session_position_idx" ON "public"."study_session_items" USING "btree" ("user_id", "session_id", "position");



CREATE INDEX "study_sessions_active_idx" ON "public"."study_sessions" USING "btree" ("module_id", "started_at" DESC) WHERE ("trash_id" IS NULL);



CREATE INDEX "study_sessions_user_module_started_idx" ON "public"."study_sessions" USING "btree" ("user_id", "module_id", "started_at" DESC);



CREATE INDEX "study_sessions_user_started_idx" ON "public"."study_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "topic_images_active_idx" ON "public"."topic_images" USING "btree" ("topic_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "topic_images_topic_user_position_id_idx" ON "public"."topic_images" USING "btree" ("topic_id", "user_id", "position", "id");



CREATE INDEX "topic_images_user_id_idx" ON "public"."topic_images" USING "btree" ("user_id");



CREATE INDEX "topic_learning_sessions_chapter_owner_idx" ON "public"."topic_learning_sessions" USING "btree" ("chapter_id", "user_id");



CREATE INDEX "topic_learning_sessions_module_owner_idx" ON "public"."topic_learning_sessions" USING "btree" ("module_id", "user_id");



CREATE INDEX "topic_learning_sessions_topic_owner_idx" ON "public"."topic_learning_sessions" USING "btree" ("topic_id", "user_id");



CREATE INDEX "topic_learning_sessions_user_started_idx" ON "public"."topic_learning_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "topics_active_idx" ON "public"."topics" USING "btree" ("chapter_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "topics_chapter_id_idx" ON "public"."topics" USING "btree" ("chapter_id");



CREATE UNIQUE INDEX "topics_chapter_title_unique_idx" ON "public"."topics" USING "btree" ("chapter_id", "lower"("btrim"("title")));



CREATE INDEX "topics_first_completion_idx" ON "public"."topics" USING "btree" ("user_id", "first_completed_at") WHERE (("trash_id" IS NULL) AND ("first_completed_at" IS NOT NULL));



CREATE UNIQUE INDEX "topics_id_user_id_unique" ON "public"."topics" USING "btree" ("id", "user_id");



CREATE INDEX "topics_title_search_idx" ON "public"."topics" USING "gin" ("lower"("title") "extensions"."gin_trgm_ops");



CREATE INDEX "topics_title_trgm_idx" ON "public"."topics" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "topics_user_chapter_position_id_idx" ON "public"."topics" USING "btree" ("user_id", "chapter_id", "position", "id");



CREATE INDEX "trash_items_purge_after_idx" ON "public"."trash_items" USING "btree" ("purge_after");



CREATE INDEX "trash_items_user_deleted_idx" ON "public"."trash_items" USING "btree" ("user_id", "deleted_at" DESC);



CREATE OR REPLACE TRIGGER "set_module_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."modules" FOR EACH ROW EXECUTE FUNCTION "public"."set_module_slug"();



CREATE OR REPLACE TRIGGER "sync_chapter_questions_module" AFTER UPDATE OF "module_id" ON "public"."chapters" FOR EACH ROW EXECUTE FUNCTION "public"."sync_chapter_questions_module"();



CREATE OR REPLACE TRIGGER "sync_topic_first_completed_at" BEFORE INSERT OR UPDATE OF "completed", "first_completed_at" ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "public"."sync_topic_first_completed_at"();



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_goals"
    ADD CONSTRAINT "study_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_session_items"
    ADD CONSTRAINT "study_session_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."study_session_items"
    ADD CONSTRAINT "study_session_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_session_items"
    ADD CONSTRAINT "study_session_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_topic_owner_fkey" FOREIGN KEY ("topic_id", "user_id") REFERENCES "public"."topics"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_learning_sessions"
    ADD CONSTRAINT "topic_learning_sessions_chapter_owner_fkey" FOREIGN KEY ("chapter_id", "user_id") REFERENCES "public"."chapters"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_learning_sessions"
    ADD CONSTRAINT "topic_learning_sessions_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_learning_sessions"
    ADD CONSTRAINT "topic_learning_sessions_topic_owner_fkey" FOREIGN KEY ("topic_id", "user_id") REFERENCES "public"."topics"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_learning_sessions"
    ADD CONSTRAINT "topic_learning_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_chapter_owner_fkey" FOREIGN KEY ("chapter_id", "user_id") REFERENCES "public"."chapters"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trash_items"
    ADD CONSTRAINT "trash_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Only active chapters are readable" ON "public"."chapters" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("trash_id" IS NULL));



CREATE POLICY "Only active images are readable" ON "public"."topic_images" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("trash_id" IS NULL));



CREATE POLICY "Only active modules are readable" ON "public"."modules" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("trash_id" IS NULL));



CREATE POLICY "Only active questions are readable" ON "public"."questions" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("trash_id" IS NULL));



CREATE POLICY "Only active sessions are readable" ON "public"."study_sessions" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("trash_id" IS NULL));



CREATE POLICY "Only active topics are readable" ON "public"."topics" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("trash_id" IS NULL));



CREATE POLICY "Only items of active sessions are readable" ON "public"."study_session_items" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."study_sessions" "s"
  WHERE (("s"."id" = "study_session_items"."session_id") AND ("s"."trash_id" IS NULL)))));



CREATE POLICY "Only options of active questions are readable" ON "public"."question_options" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."questions" "q"
  WHERE (("q"."id" = "question_options"."question_id") AND ("q"."trash_id" IS NULL)))));



CREATE POLICY "Users can create own chapters" ON "public"."chapters" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create own topic learning sessions" ON "public"."topic_learning_sessions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create own topics" ON "public"."topics" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own chapters" ON "public"."chapters" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own topic images" ON "public"."topic_images" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own topics" ON "public"."topics" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own topic images" ON "public"."topic_images" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own chapters" ON "public"."chapters" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own topic images" ON "public"."topic_images" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own topic learning sessions" ON "public"."topic_learning_sessions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own topics" ON "public"."topics" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own chapters" ON "public"."chapters" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own topic images" ON "public"."topic_images" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own topic learning sessions" ON "public"."topic_learning_sessions" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own topics" ON "public"."topics" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users create own study goal" ON "public"."study_goals" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own modules" ON "public"."modules" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own trash" ON "public"."trash_items" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own modules" ON "public"."modules" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own question options" ON "public"."question_options" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."questions"
  WHERE (("questions"."id" = "question_options"."question_id") AND ("questions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users manage own questions" ON "public"."questions" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (("chapter_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."chapters"
  WHERE (("chapters"."id" = "questions"."chapter_id") AND ("chapters"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) AND (("topic_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."topics"
  WHERE (("topics"."id" = "questions"."topic_id") AND ("topics"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("topics"."chapter_id" IS NULL) OR ("topics"."chapter_id" = "questions"."chapter_id"))))))));



CREATE POLICY "Users manage own study session items" ON "public"."study_session_items" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."study_sessions"
  WHERE (("study_sessions"."id" = "study_session_items"."session_id") AND ("study_sessions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users manage own study sessions" ON "public"."study_sessions" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read own study goal" ON "public"."study_goals" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Users read own trash" ON "public"."trash_items" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users select own modules" ON "public"."modules" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own modules" ON "public"."modules" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own study goal" ON "public"."study_goals" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."chapters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_session_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_learning_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trash_items" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_topic_learning"("target_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_topic_learning"("target_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_topic_learning"("target_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_learning_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_learning_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_learning_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_progress_overview_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_progress_overview_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_progress_overview_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_progress_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_progress_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_progress_statistics"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_progress_topics_page"("target_module_id" "uuid", "sort_mode" "text", "page_size" integer, "after_sort_rank" integer, "after_chapter_position" bigint, "after_topic_position" bigint, "after_topic_id" "uuid", "completion_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_progress_topics_page"("target_module_id" "uuid", "sort_mode" "text", "page_size" integer, "after_sort_rank" integer, "after_chapter_position" bigint, "after_topic_position" bigint, "after_topic_id" "uuid", "completion_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_progress_topics_page"("target_module_id" "uuid", "sort_mode" "text", "page_size" integer, "after_sort_rank" integer, "after_chapter_position" bigint, "after_topic_position" bigint, "after_topic_id" "uuid", "completion_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_topic_learning"("target_session_id" bigint, "total_active_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_topic_learning"("target_session_id" bigint, "total_active_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_topic_learning"("target_session_id" bigint, "total_active_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_module_slug"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_module_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_chapter_questions_module"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_chapter_questions_module"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_chapter_questions_module"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_topic_first_completed_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_topic_first_completed_at"() TO "service_role";



GRANT ALL ON TABLE "public"."chapters" TO "authenticated";
GRANT ALL ON TABLE "public"."chapters" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."modules" TO "authenticated";



GRANT ALL ON TABLE "public"."question_options" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."question_options" TO "authenticated";



GRANT ALL ON TABLE "public"."questions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."questions" TO "authenticated";



GRANT ALL ON TABLE "public"."study_goals" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."study_goals" TO "authenticated";



GRANT ALL ON TABLE "public"."study_session_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."study_session_items" TO "authenticated";



GRANT ALL ON TABLE "public"."study_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."study_sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."topic_images" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_images" TO "service_role";



GRANT ALL ON TABLE "public"."topic_learning_sessions" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."topic_learning_sessions" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."topic_learning_sessions_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."topic_learning_sessions_id_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";



GRANT ALL ON TABLE "public"."trash_items" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."trash_items" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";





