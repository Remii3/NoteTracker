


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


CREATE SCHEMA IF NOT EXISTS "extensions";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."build_trash_tree"("target_trash_id" "uuid", "target_type" "text", "target_item_id" "uuid", "target_title" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid;
  child_nodes jsonb := '[]'::jsonb;
  root_deleted boolean := false;
begin
  select trash.user_id
  into owner_id
  from public.trash_items as trash
  where trash.id = target_trash_id;

  if owner_id is null then
    return null;
  end if;

  if target_type = 'module' then
    select exists (
      select 1 from public.modules as module
      where module.id = target_item_id
        and module.user_id = owner_id
        and module.trash_id = target_trash_id
    ) into root_deleted;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', chapter.id,
          'type', 'chapter',
          'title', chapter.title,
          'is_deleted', chapter.trash_id = target_trash_id,
          'children', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', topic.id,
                'type', 'topic',
                'title', topic.title,
                'is_deleted', true,
                'children', '[]'::jsonb
              ) order by topic.position, topic.id
            )
            from public.topics as topic
            where topic.chapter_id = chapter.id
              and topic.user_id = owner_id
              and topic.trash_id = target_trash_id
          ), '[]'::jsonb)
        ) order by chapter.position, chapter.id
      ),
      '[]'::jsonb
    )
    into child_nodes
    from public.chapters as chapter
    where chapter.module_id = target_item_id
      and chapter.user_id = owner_id
      and (
        chapter.trash_id = target_trash_id
        or exists (
          select 1
          from public.topics as topic
          where topic.chapter_id = chapter.id
            and topic.user_id = owner_id
            and topic.trash_id = target_trash_id
        )
      );
  elsif target_type = 'chapter' then
    select exists (
      select 1 from public.chapters as chapter
      where chapter.id = target_item_id
        and chapter.user_id = owner_id
        and chapter.trash_id = target_trash_id
    ) into root_deleted;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', topic.id,
          'type', 'topic',
          'title', topic.title,
          'is_deleted', true,
          'children', '[]'::jsonb
        ) order by topic.position, topic.id
      ),
      '[]'::jsonb
    )
    into child_nodes
    from public.topics as topic
    where topic.chapter_id = target_item_id
      and topic.user_id = owner_id
      and topic.trash_id = target_trash_id;
  elsif target_type = 'topic' then
    select exists (
      select 1 from public.topics as topic
      where topic.id = target_item_id
        and topic.user_id = owner_id
        and topic.trash_id = target_trash_id
    ) into root_deleted;
  elsif target_type = 'image' then
    select exists (
      select 1 from public.topic_images as image
      where image.id = target_item_id
        and image.user_id = owner_id
        and image.trash_id = target_trash_id
    ) into root_deleted;
  elsif target_type = 'question' then
    select exists (
      select 1 from public.questions as question
      where question.id = target_item_id
        and question.user_id = owner_id
        and question.trash_id = target_trash_id
    ) into root_deleted;
  elsif target_type = 'study_session' then
    select exists (
      select 1 from public.study_sessions as session
      where session.id = target_item_id
        and session.user_id = owner_id
        and session.trash_id = target_trash_id
    ) into root_deleted;
  end if;

  return jsonb_build_object(
    'id', target_item_id,
    'type', target_type,
    'title', target_title,
    'is_deleted', root_deleted,
    'children', child_nodes
  );
end;
$$;


ALTER FUNCTION "private"."build_trash_tree"("target_trash_id" "uuid", "target_type" "text", "target_item_id" "uuid", "target_title" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."question_review_states" (
    "user_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "due_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "stability" double precision DEFAULT 0 NOT NULL,
    "difficulty" double precision DEFAULT 0 NOT NULL,
    "elapsed_days" integer DEFAULT 0 NOT NULL,
    "scheduled_days" integer DEFAULT 0 NOT NULL,
    "learning_steps" integer DEFAULT 0 NOT NULL,
    "repetitions" integer DEFAULT 0 NOT NULL,
    "lapses" integer DEFAULT 0 NOT NULL,
    "state" "text" DEFAULT 'new'::"text" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "parameters_version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "question_review_states_state_check" CHECK (("state" = ANY (ARRAY['new'::"text", 'learning'::"text", 'review'::"text", 'relearning'::"text"]))),
    CONSTRAINT "question_review_states_values_check" CHECK ((("stability" >= (0)::double precision) AND ("difficulty" >= (0)::double precision) AND ("elapsed_days" >= 0) AND ("scheduled_days" >= 0) AND ("learning_steps" >= 0) AND ("repetitions" >= 0) AND ("lapses" >= 0) AND ("version" >= 0)))
);


ALTER TABLE "public"."question_review_states" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."calculate_fsrs_v6_transition"("current_state" "public"."question_review_states", "review_rating" smallint, "review_time" timestamp with time zone, "desired_retention" double precision, "parameters" double precision[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  default_parameters constant double precision[] := array[
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
    0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
    1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
  ];
  weights double precision[] := coalesce(parameters, default_parameters);
  old_state text := coalesce(current_state.state, 'new');
  old_stability double precision := coalesce(current_state.stability, 0);
  old_difficulty double precision := coalesce(current_state.difficulty, 0);
  old_steps integer := coalesce(current_state.learning_steps, 0);
  elapsed integer := 0;
  next_stability double precision;
  next_difficulty double precision;
  next_state text;
  next_steps integer := 0;
  next_scheduled integer := 0;
  next_lapses integer := coalesce(current_state.lapses, 0);
  next_repetitions integer := coalesce(current_state.repetitions, 0) + 1;
  scheduled_minutes integer;
  due_at timestamptz;
  retrievability double precision;
  decay double precision;
  factor double precision;
  interval_modifier double precision;
  hard_stability double precision;
  good_stability double precision;
  easy_stability double precision;
  hard_interval integer;
  good_interval integer;
  easy_interval integer;
  stability_increase double precision;
begin
  if review_rating not between 1 and 4
    or desired_retention not between 0.7 and 0.99
    or cardinality(weights) <> 21
  then raise exception 'Nieprawidłowe dane harmonogramu FSRS.'; end if;

  if old_state <> 'new' and current_state.last_reviewed_at is not null then
    elapsed := greatest(0,
      (review_time at time zone 'UTC')::date
      - (current_state.last_reviewed_at at time zone 'UTC')::date);
  end if;

  decay := -weights[21];
  factor := private.fsrs_round8(exp(ln(0.9) / decay) - 1);
  interval_modifier := private.fsrs_round8(
    (power(desired_retention, 1 / decay) - 1) / factor);

  if old_stability = 0 and old_difficulty = 0 then
    next_stability := greatest(weights[review_rating], 0.1);
    next_difficulty := private.fsrs_round8(
      least(10, greatest(1,
        weights[5] - exp((review_rating - 1) * weights[6]) + 1)));
  else
    retrievability := private.fsrs_round8(
      power(1 + factor * elapsed / old_stability, decay));
    next_difficulty := private.fsrs_round8(least(10, greatest(1,
      weights[8]
        * private.fsrs_round8(weights[5] - exp(3 * weights[6]) + 1)
      + (1 - weights[8]) * (
          old_difficulty
          + private.fsrs_round8(
              (-weights[7] * (review_rating - 3))
              * (10 - old_difficulty) / 9)
        )
    )));

    if elapsed = 0 then
      stability_increase := power(old_stability, -weights[20])
        * exp(weights[18] * (review_rating - 3 + weights[19]));
      if review_rating >= 2 then
        stability_increase := greatest(stability_increase, 1);
      end if;
      next_stability := private.fsrs_round8(least(36500, greatest(0.001,
        old_stability * stability_increase)));
    elsif review_rating = 1 then
      next_stability := private.fsrs_round8(least(
        least(36500, greatest(0.001,
          weights[12] * power(old_difficulty, -weights[13])
          * (power(old_stability + 1, weights[14]) - 1)
          * exp((1 - retrievability) * weights[15])
        )),
        greatest(0.001,
          private.fsrs_round8(old_stability / exp(weights[18] * weights[19])))
      ));
    else
      next_stability := private.fsrs_round8(least(36500, greatest(0.001,
        old_stability * (
          1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1)
          * case when review_rating = 2 then weights[16] else 1 end
          * case when review_rating = 4 then weights[17] else 1 end
        )
      )));
    end if;
  end if;

  -- Default ts-fsrs 5.4.2 learning steps: 1m, 10m; relearning: 10m.
  if old_state = 'review' and review_rating = 1 then
    scheduled_minutes := 10;
    next_state := 'relearning';
    next_lapses := next_lapses + 1;
  elsif old_state = 'relearning' and review_rating = 1 then
    scheduled_minutes := 10;
    next_state := 'relearning';
  elsif old_state = 'relearning' and review_rating = 2 then
    scheduled_minutes := 15;
    next_state := 'relearning';
  elsif old_state in ('new', 'learning') and review_rating = 1 then
    scheduled_minutes := 1;
    next_state := 'learning';
  elsif old_state in ('new', 'learning') and review_rating = 2 then
    scheduled_minutes := 6;
    next_state := 'learning';
    next_steps := old_steps;
  elsif old_state in ('new', 'learning') and review_rating = 3 and old_steps = 0 then
    scheduled_minutes := 10;
    next_state := 'learning';
    next_steps := 1;
  else
    next_state := 'review';

    if old_state = 'review' then
      -- Review intervals are ordered Hard < Good < Easy by the scheduler.
      if elapsed = 0 then
        hard_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * greatest(
            power(old_stability, -weights[20])
              * exp(weights[18] * (2 - 3 + weights[19])), 1))));
        good_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * greatest(
            power(old_stability, -weights[20])
              * exp(weights[18] * (3 - 3 + weights[19])), 1))));
        easy_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * greatest(
            power(old_stability, -weights[20])
              * exp(weights[18] * (4 - 3 + weights[19])), 1))));
      else
        hard_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * (1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1) * weights[16]))));
        good_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * (1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1)))));
        easy_stability := private.fsrs_round8(least(36500, greatest(0.001,
          old_stability * (1 + exp(weights[9]) * (11 - old_difficulty)
          * power(old_stability, -weights[10])
          * (exp((1 - retrievability) * weights[11]) - 1) * weights[17]))));
      end if;
      hard_interval := least(36500, greatest(1,
        round(hard_stability * interval_modifier)::integer));
      good_interval := least(36500, greatest(1,
        round(good_stability * interval_modifier)::integer));
      hard_interval := least(hard_interval, good_interval);
      good_interval := greatest(good_interval, hard_interval + 1);
      easy_interval := greatest(
        least(36500, greatest(1,
          round(easy_stability * interval_modifier)::integer)),
        good_interval + 1);
      next_scheduled := case review_rating
        when 2 then hard_interval when 3 then good_interval else easy_interval end;
    else
      next_scheduled := least(36500, greatest(1,
        round(next_stability * interval_modifier)::integer));
    end if;
  end if;

  if scheduled_minutes is not null then
    due_at := review_time + make_interval(mins => scheduled_minutes);
    next_scheduled := 0;
  else
    due_at := review_time + make_interval(days => next_scheduled);
  end if;

  return jsonb_build_object(
    'dueAt', due_at,
    'stability', next_stability,
    'difficulty', next_difficulty,
    'elapsedDays', elapsed,
    'scheduledDays', next_scheduled,
    'learningSteps', next_steps,
    'repetitions', next_repetitions,
    'lapses', next_lapses,
    'state', next_state
  );
end;
$$;


ALTER FUNCTION "private"."calculate_fsrs_v6_transition"("current_state" "public"."question_review_states", "review_rating" smallint, "review_time" timestamp with time zone, "desired_retention" double precision, "parameters" double precision[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."fsrs_round8"("value" double precision) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select round(value::numeric, 8)::double precision;
$$;


ALTER FUNCTION "private"."fsrs_round8"("value" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") RETURNS TABLE("storage_key" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid;
  kind text;
  entity_id uuid;
  root_will_be_deleted boolean := false;
begin
  select trash.user_id, trash.item_type, trash.item_id
  into owner_id, kind, entity_id
  from public.trash_items as trash
  where trash.id = target_trash_id;

  if owner_id is null
     or (
       (select auth.uid()) is distinct from owner_id
       and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     ) then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  root_will_be_deleted :=
    (kind = 'module' and exists (
      select 1 from public.modules as module
      where module.id = entity_id and module.user_id = owner_id and module.trash_id = target_trash_id
    ))
    or (kind = 'chapter' and exists (
      select 1 from public.chapters as chapter
      where chapter.id = entity_id and chapter.user_id = owner_id and chapter.trash_id = target_trash_id
    ))
    or (kind = 'topic' and exists (
      select 1 from public.topics as topic
      where topic.id = entity_id and topic.user_id = owner_id and topic.trash_id = target_trash_id
    ));

  return query
  select distinct image.storage_key
  from public.topic_images as image
  join public.topics as topic on topic.id = image.topic_id
  join public.chapters as chapter on chapter.id = topic.chapter_id
  where image.user_id = owner_id
    and (
      image.trash_id = target_trash_id
      or (
        root_will_be_deleted
        and (
          (kind = 'module' and chapter.module_id = entity_id)
          or (kind = 'chapter' and chapter.id = entity_id)
          or (kind = 'topic' and topic.id = entity_id)
        )
      )
    );
end;
$$;


ALTER FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "page_cursor_id" "uuid" DEFAULT NULL::"uuid", "requested_page_size" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "item_type" "text", "item_id" "uuid", "title" "text", "deleted_at" timestamp with time zone, "purge_after" timestamp with time zone, "source_path" "text"[], "tree" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  safe_page_size integer := least(greatest(coalesce(requested_page_size, 10), 1), 50);
begin
  if owner_id is null then
    raise exception 'Sesja wygasła.';
  end if;
  if (page_cursor_deleted_at is null) <> (page_cursor_id is null) then
    raise exception 'Nieprawidłowy kursor strony.';
  end if;

  return query
  with selected_items as materialized (
    select trash.*
    from public.trash_items as trash
    where trash.user_id = owner_id
      and (
        page_cursor_deleted_at is null
        or (trash.deleted_at, trash.id) < (page_cursor_deleted_at, page_cursor_id)
      )
    order by trash.deleted_at desc, trash.id desc
    limit safe_page_size + 1
  )
  select
    selected.id,
    selected.item_type,
    selected.item_id,
    selected.title,
    selected.deleted_at,
    selected.purge_after,
    case selected.item_type
      when 'chapter' then array_remove(array[
        (select module.name
         from public.chapters as chapter
         join public.modules as module on module.id = chapter.module_id
         where chapter.id = selected.item_id and chapter.user_id = owner_id)
      ], null)
      when 'topic' then array_remove(array[
        (select module.name
         from public.topics as topic
         join public.chapters as chapter on chapter.id = topic.chapter_id
         join public.modules as module on module.id = chapter.module_id
         where topic.id = selected.item_id and topic.user_id = owner_id),
        (select chapter.title
         from public.topics as topic
         join public.chapters as chapter on chapter.id = topic.chapter_id
         where topic.id = selected.item_id and topic.user_id = owner_id)
      ], null)
      when 'image' then array_remove(array[
        (select module.name
         from public.topic_images as image
         join public.topics as topic on topic.id = image.topic_id
         join public.chapters as chapter on chapter.id = topic.chapter_id
         join public.modules as module on module.id = chapter.module_id
         where image.id = selected.item_id and image.user_id = owner_id),
        (select chapter.title
         from public.topic_images as image
         join public.topics as topic on topic.id = image.topic_id
         join public.chapters as chapter on chapter.id = topic.chapter_id
         where image.id = selected.item_id and image.user_id = owner_id),
        (select topic.title
         from public.topic_images as image
         join public.topics as topic on topic.id = image.topic_id
         where image.id = selected.item_id and image.user_id = owner_id)
      ], null)
      when 'question' then array_remove(array[
        (select module.name
         from public.questions as question
         join public.modules as module on module.id = question.module_id
         where question.id = selected.item_id and question.user_id = owner_id),
        (select chapter.title
         from public.questions as question
         join public.chapters as chapter on chapter.id = question.chapter_id
         where question.id = selected.item_id and question.user_id = owner_id),
        (select topic.title
         from public.questions as question
         join public.topics as topic on topic.id = question.topic_id
         where question.id = selected.item_id and question.user_id = owner_id)
      ], null)
      when 'study_session' then array_remove(array[
        (select module.name
         from public.study_sessions as session
         join public.modules as module on module.id = session.module_id
         where session.id = selected.item_id and session.user_id = owner_id)
      ], null)
      else array[]::text[]
    end as source_path,
    private.build_trash_tree(
      selected.id,
      selected.item_type,
      selected.item_id,
      selected.title
    ) as tree,
    (select count(*) from public.trash_items as counted where counted.user_id = owner_id) as total_count
  from selected_items as selected
  order by selected.deleted_at desc, selected.id desc;
end;
$$;


ALTER FUNCTION "private"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_exam_plans_dirty_for_question"("owner_id" "uuid", "target_module_id" "uuid", "target_topic_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  update public.exam_plans as plan
  set needs_rebuild = true,
    updated_at = now()
  where plan.user_id = owner_id
    and plan.module_id = target_module_id
    and plan.status = 'active'
    and (
      exists (
        select 1
        from public.exam_plan_topics as scope
        where scope.exam_plan_id = plan.id
          and scope.user_id = owner_id
          and scope.topic_id = target_topic_id
      )
      or (
        target_topic_id is null
        and plan.include_unassigned_questions
      )
    );
$$;


ALTER FUNCTION "private"."mark_exam_plans_dirty_for_question"("owner_id" "uuid", "target_module_id" "uuid", "target_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_exam_plans_dirty_on_question_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.mark_exam_plans_dirty_for_question(
      old.user_id,
      old.module_id,
      old.topic_id
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform private.mark_exam_plans_dirty_for_question(
      new.user_id,
      new.module_id,
      new.topic_id
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."mark_exam_plans_dirty_on_question_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_exam_plans_dirty_on_review_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  changed_question_id uuid;
  owner_id uuid;
  target_module_id uuid;
  target_topic_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_question_id := old.question_id;
  else
    changed_question_id := new.question_id;
  end if;

  select question.user_id, question.module_id, question.topic_id
  into owner_id, target_module_id, target_topic_id
  from public.questions as question
  where question.id = changed_question_id;

  if owner_id is not null then
    perform private.mark_exam_plans_dirty_for_question(
      owner_id,
      target_module_id,
      target_topic_id
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."mark_exam_plans_dirty_on_review_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_exam_plans_dirty_on_topic_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if old.completed is distinct from new.completed then
    update public.exam_plans as plan
    set needs_rebuild = true,
      updated_at = now()
    where plan.user_id = new.user_id
      and plan.status = 'active'
      and exists (
        select 1
        from public.exam_plan_topics as scope
        where scope.exam_plan_id = plan.id
          and scope.topic_id = new.id
          and scope.user_id = new.user_id
      );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."mark_exam_plans_dirty_on_topic_change"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "private"."normalize_question_duplicate_text"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(value, '')), '\s+', ' ', 'g')
  );
$$;


ALTER FUNCTION "private"."normalize_question_duplicate_text"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid;
begin
  select trash.user_id
  into owner_id
  from public.trash_items as trash
  where trash.id = target_trash_id
  for update;

  if owner_id is null
     or (
       (select auth.uid()) is distinct from owner_id
       and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     ) then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  delete from public.topic_images where trash_id = target_trash_id and user_id = owner_id;
  delete from public.questions where trash_id = target_trash_id and user_id = owner_id;
  delete from public.study_sessions where trash_id = target_trash_id and user_id = owner_id;
  delete from public.topics where trash_id = target_trash_id and user_id = owner_id;
  delete from public.chapters where trash_id = target_trash_id and user_id = owner_id;
  delete from public.modules where trash_id = target_trash_id and user_id = owner_id;
  delete from public.trash_items where id = target_trash_id and user_id = owner_id;

  delete from public.trash_items as trash
  where trash.user_id = owner_id
    and not exists (select 1 from public.modules as module where module.trash_id = trash.id)
    and not exists (select 1 from public.chapters as chapter where chapter.trash_id = trash.id)
    and not exists (select 1 from public.topics as topic where topic.trash_id = trash.id)
    and not exists (select 1 from public.topic_images as image where image.trash_id = trash.id)
    and not exists (select 1 from public.questions as question where question.trash_id = trash.id)
    and not exists (select 1 from public.study_sessions as session where session.trash_id = trash.id);
end;
$$;


ALTER FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."question_dedupe_key"("question_content" "text", "options" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'content', private.normalize_question_duplicate_text(question_content),
      'options', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            private.normalize_question_duplicate_text(option.value ->> 'content'),
            coalesce((option.value ->> 'isCorrect')::boolean, false)
          )
          order by
            private.normalize_question_duplicate_text(option.value ->> 'content'),
            coalesce((option.value ->> 'isCorrect')::boolean, false)
        )
        from pg_catalog.jsonb_array_elements(coalesce(options, '[]'::jsonb))
          as option(value)
      ), '[]'::jsonb)
    )::text
  );
$$;


ALTER FUNCTION "private"."question_dedupe_key"("question_content" "text", "options" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
  target_item public.study_session_items%rowtype;
  current_state public.question_review_states%rowtype;
  profile public.fsrs_profiles%rowtype;
  transition jsonb;
  result_value text;
begin
  if caller_id is null
    or review_rating not between 1 and 4
    or review_time > now() + interval '5 minutes'
    or duration_seconds not between 0 and 86400
  then raise exception 'Nieprawidłowe dane powtórki FSRS.'; end if;

  select item.* into target_item
  from public.study_session_items as item
  join public.study_sessions as session on session.id = item.session_id
  where item.id = target_session_item_id
    and item.user_id = caller_id
    and session.user_id = caller_id
    and session.status = 'in_progress'
    and item.question_id is not null
    and review_time >= session.started_at
  for update of item;
  if target_item.id is null or target_item.result is not null then
    raise exception 'Odpowiedź została już zapisana albo sesja jest nieaktywna.';
  end if;

  insert into public.fsrs_profiles (user_id)
  values (caller_id) on conflict (user_id) do nothing;
  select * into profile from public.fsrs_profiles
  where user_id = caller_id for update;
  if profile.parameters_version <> used_parameters_version then
    raise exception 'Parametry FSRS zmieniły się. Odśwież sesję.';
  end if;

  select * into current_state from public.question_review_states
  where user_id = caller_id and question_id = target_item.question_id
  for update;
  if current_state.question_id is null then
    current_state.user_id := caller_id;
    current_state.question_id := target_item.question_id;
    current_state.due_at := review_time;
    current_state.stability := 0;
    current_state.difficulty := 0;
    current_state.elapsed_days := 0;
    current_state.scheduled_days := 0;
    current_state.learning_steps := 0;
    current_state.repetitions := 0;
    current_state.lapses := 0;
    current_state.state := 'new';
    current_state.version := 0;
  end if;
  if current_state.version <> expected_version then
    raise exception 'Stan pytania zmienił się. Odśwież sesję.';
  end if;
  if current_state.last_reviewed_at is not null
    and review_time < current_state.last_reviewed_at
  then raise exception 'Data powtórki jest starsza od aktualnego stanu pytania.';
  end if;
  if selected_option is not null and not exists (
    select 1 from jsonb_array_elements(target_item.options_snapshot) option
    where option->>'id' = selected_option::text
  ) then raise exception 'Wybrana odpowiedź nie należy do pytania.';
  end if;

  transition := private.calculate_fsrs_v6_transition(
    current_state, review_rating, review_time,
    profile.desired_retention, profile.parameters);

  result_value := case
    when target_item.options_snapshot is not null and selected_option is not null
      then case when exists (
        select 1 from jsonb_array_elements(target_item.options_snapshot) option
        where option->>'id' = selected_option::text
          and (option->>'isCorrect')::boolean
      ) then 'correct' else 'incorrect' end
    when review_rating = 1 then 'forgotten'
    else 'remembered' end;

  insert into public.question_review_states (
    user_id, question_id, due_at, last_reviewed_at, stability, difficulty,
    elapsed_days, scheduled_days, learning_steps, repetitions, lapses, state,
    version, parameters_version, updated_at
  ) values (
    caller_id, target_item.question_id, (transition->>'dueAt')::timestamptz,
    review_time, (transition->>'stability')::double precision,
    (transition->>'difficulty')::double precision,
    (transition->>'elapsedDays')::integer,
    (transition->>'scheduledDays')::integer,
    (transition->>'learningSteps')::integer,
    (transition->>'repetitions')::integer,
    (transition->>'lapses')::integer, transition->>'state',
    expected_version + 1, used_parameters_version, now()
  ) on conflict (user_id, question_id) do update set
    due_at = excluded.due_at, last_reviewed_at = excluded.last_reviewed_at,
    stability = excluded.stability, difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
    learning_steps = excluded.learning_steps, repetitions = excluded.repetitions,
    lapses = excluded.lapses, state = excluded.state, version = excluded.version,
    parameters_version = excluded.parameters_version, updated_at = excluded.updated_at;

  insert into public.question_review_logs (
    user_id, question_id, session_id, session_item_id, reviewed_at, rating,
    duration_seconds, state_before, state_after, due_before, due_after,
    stability_before, stability_after, difficulty_before, difficulty_after,
    elapsed_days, scheduled_days, parameters_version
  ) values (
    caller_id, target_item.question_id, target_item.session_id, target_item.id,
    review_time, review_rating, duration_seconds, current_state.state,
    transition->>'state', current_state.due_at,
    (transition->>'dueAt')::timestamptz, current_state.stability,
    (transition->>'stability')::double precision, current_state.difficulty,
    (transition->>'difficulty')::double precision,
    (transition->>'elapsedDays')::integer,
    (transition->>'scheduledDays')::integer, used_parameters_version
  );

  update public.study_session_items set result = result_value,
    selected_option_id = selected_option, answered_at = review_time,
    active_duration_seconds = duration_seconds
  where id = target_item.id;

  return jsonb_build_object('result', result_value,
    'version', expected_version + 1, 'dueAt', transition->>'dueAt');
end;
$$;


ALTER FUNCTION "private"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."refresh_question_dedupe_key"("target_question_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with candidate as (
    select
      question.id,
      private.question_dedupe_key(
        question.content,
        coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'content', option.content,
              'isCorrect', option.is_correct
            )
            order by option.position, option.id
          )
          from public.question_options as option
          where option.question_id = question.id
        ), '[]'::jsonb)
      ) as dedupe_key
    from public.questions as question
    where question.id = target_question_id
  )
  update public.questions as question
  set dedupe_key = candidate.dedupe_key
  from candidate
  where question.id = candidate.id
    and question.dedupe_key is distinct from candidate.dedupe_key;
$$;


ALTER FUNCTION "private"."refresh_question_dedupe_key"("target_question_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."refresh_question_dedupe_key_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_question_dedupe_key(old.question_id);
  elsif tg_op = 'UPDATE' then
    perform private.refresh_question_dedupe_key(old.question_id);
    if new.question_id is distinct from old.question_id then
      perform private.refresh_question_dedupe_key(new.question_id);
    end if;
  else
    perform private.refresh_question_dedupe_key(new.question_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."refresh_question_dedupe_key_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."refresh_question_row_dedupe_key_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op <> 'DELETE' then
    perform private.refresh_question_dedupe_key(new.id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."refresh_question_row_dedupe_key_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  root_type text;
  root_id uuid;
begin
  select trash.item_type, trash.item_id
  into root_type, root_id
  from public.trash_items as trash
  where trash.id = target_trash_id and trash.user_id = owner_id;

  if root_type is null then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  perform private.restore_trash_node(target_trash_id, root_type, root_id);
end;
$$;


ALTER FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  root_type text;
  root_id uuid;
  ancestor_module_id uuid;
  ancestor_chapter_id uuid;
  ancestor_topic_id uuid;
  restore_whole_event boolean := false;
begin
  if owner_id is null then
    raise exception 'Sesja wygasła.';
  end if;

  select trash.item_type, trash.item_id
  into root_type, root_id
  from public.trash_items as trash
  where trash.id = target_trash_id and trash.user_id = owner_id
  for update;

  if root_type is null then
    raise exception 'Nie znaleziono elementu w koszu.';
  end if;

  restore_whole_event := target_node_type = root_type and target_node_id = root_id;

  if restore_whole_event then
    if root_type = 'chapter' then
      select chapter.module_id
      into ancestor_module_id
      from public.chapters as chapter
      where chapter.id = root_id and chapter.user_id = owner_id;
    elsif root_type = 'topic' then
      select chapter.module_id, topic.chapter_id
      into ancestor_module_id, ancestor_chapter_id
      from public.topics as topic
      join public.chapters as chapter on chapter.id = topic.chapter_id
      where topic.id = root_id and topic.user_id = owner_id;
    elsif root_type = 'image' then
      select chapter.module_id, topic.chapter_id, image.topic_id
      into ancestor_module_id, ancestor_chapter_id, ancestor_topic_id
      from public.topic_images as image
      join public.topics as topic on topic.id = image.topic_id
      join public.chapters as chapter on chapter.id = topic.chapter_id
      where image.id = root_id and image.user_id = owner_id;
    elsif root_type = 'question' then
      select question.module_id, question.chapter_id, question.topic_id
      into ancestor_module_id, ancestor_chapter_id, ancestor_topic_id
      from public.questions as question
      where question.id = root_id and question.user_id = owner_id;
    elsif root_type = 'study_session' then
      select session.module_id
      into ancestor_module_id
      from public.study_sessions as session
      where session.id = root_id and session.user_id = owner_id;
    end if;
  elsif target_node_type = 'chapter' and root_type = 'module' then
    select chapter.module_id
    into ancestor_module_id
    from public.chapters as chapter
    where chapter.id = target_node_id
      and chapter.module_id = root_id
      and chapter.user_id = owner_id
      and chapter.trash_id = target_trash_id;
  elsif target_node_type = 'topic' and root_type in ('module', 'chapter') then
    select chapter.module_id, topic.chapter_id
    into ancestor_module_id, ancestor_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = target_node_id
      and topic.user_id = owner_id
      and topic.trash_id = target_trash_id
      and (
        (root_type = 'module' and chapter.module_id = root_id)
        or (root_type = 'chapter' and chapter.id = root_id)
      );
  else
    raise exception 'Nie znaleziono elementu w tym drzewie kosza.';
  end if;

  if not restore_whole_event and ancestor_module_id is null then
    raise exception 'Nie znaleziono elementu w tym drzewie kosza.';
  end if;

  if ancestor_module_id is not null then
    update public.modules
    set trash_id = null
    where id = ancestor_module_id and user_id = owner_id;
  end if;
  if ancestor_chapter_id is not null then
    update public.chapters
    set trash_id = null
    where id = ancestor_chapter_id and user_id = owner_id;
  end if;
  if ancestor_topic_id is not null then
    update public.topics
    set trash_id = null
    where id = ancestor_topic_id and user_id = owner_id;
  end if;

  if restore_whole_event then
    update public.modules set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.chapters set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.topics set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.topic_images set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.questions set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
    update public.study_sessions set trash_id = null
      where trash_id = target_trash_id and user_id = owner_id;
  elsif target_node_type = 'chapter' then
    update public.chapters set trash_id = null
      where id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.topics set trash_id = null
      where chapter_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.topic_images as image
      set trash_id = null
      from public.topics as topic
      where image.topic_id = topic.id
        and topic.chapter_id = target_node_id
        and image.user_id = owner_id
        and image.trash_id = target_trash_id;
    update public.questions set trash_id = null
      where chapter_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
  elsif target_node_type = 'topic' then
    update public.topics set trash_id = null
      where id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.topic_images set trash_id = null
      where topic_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
    update public.questions set trash_id = null
      where topic_id = target_node_id and user_id = owner_id and trash_id = target_trash_id;
  end if;

  delete from public.trash_items as trash
  where trash.user_id = owner_id
    and not exists (select 1 from public.modules as module where module.trash_id = trash.id)
    and not exists (select 1 from public.chapters as chapter where chapter.trash_id = trash.id)
    and not exists (select 1 from public.topics as topic where topic.trash_id = trash.id)
    and not exists (select 1 from public.topic_images as image where image.trash_id = trash.id)
    and not exists (select 1 from public.questions as question where question.trash_id = trash.id)
    and not exists (select 1 from public.study_sessions as session where session.trash_id = trash.id);
end;
$$;


ALTER FUNCTION "private"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  command record;
begin
  for command in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if command.schema_name = 'public' then
      execute pg_catalog.format(
        'alter table if exists %s enable row level security',
        command.object_identity
      );
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "private"."rls_auto_enable"() OWNER TO "postgres";


DROP EVENT TRIGGER IF EXISTS "ensure_rls";

CREATE EVENT TRIGGER "ensure_rls"
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    EXECUTE FUNCTION "private"."rls_auto_enable"();


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_module_exam_date_from_plans"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.modules as module
    set exam_date = (
      select min(plan.exam_date)
      from public.exam_plans as plan
      where plan.module_id = old.module_id
        and plan.user_id = old.user_id
        and plan.status = 'active'
    )
    where module.id = old.module_id
      and module.user_id = old.user_id;
  end if;

  if tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and (
        new.module_id is distinct from old.module_id
        or new.user_id is distinct from old.user_id
      )
    )
  then
    update public.modules as module
    set exam_date = (
      select min(plan.exam_date)
      from public.exam_plans as plan
      where plan.module_id = new.module_id
        and plan.user_id = new.user_id
        and plan.status = 'active'
    )
    where module.id = new.module_id
      and module.user_id = new.user_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."sync_module_exam_date_from_plans"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_exam_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.module_id is distinct from old.module_id
  ) then
    raise exception 'Nie można zmienić właściciela ani modułu istniejącego planu.';
  end if;

  if not exists (
    select 1
    from public.modules as module
    where module.id = new.module_id
      and module.user_id = new.user_id
      and module.trash_id is null
  ) then
    raise exception 'Moduł planu egzaminu jest niedostępny.';
  end if;

  new.study_weekdays := array(
    select distinct weekday
    from unnest(new.study_weekdays) as weekday
    order by weekday
  );
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "private"."validate_exam_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_exam_plan_child"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid;
  owner_module_id uuid;
  topic_module_id uuid;
begin
  select plan.user_id, plan.module_id
  into owner_id, owner_module_id
  from public.exam_plans as plan
  where plan.id = new.exam_plan_id;

  if owner_id is null or owner_id is distinct from new.user_id then
    raise exception 'Nieprawidłowy właściciel planu egzaminu.';
  end if;

  if tg_table_name in ('exam_plan_topics', 'exam_plan_assignments') then
    select chapter.module_id
    into topic_module_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = new.topic_id
      and topic.user_id = new.user_id
      and topic.trash_id is null
      and chapter.user_id = new.user_id
      and chapter.trash_id is null;

    if topic_module_id is null or topic_module_id is distinct from owner_module_id then
      raise exception 'Temat nie należy do modułu planu egzaminu.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."validate_exam_plan_child"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_ai_generated_questions"("target_module_id" "uuid", "generated_questions" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  generated_question jsonb;
  generated_option jsonb;
  option_record record;
  saved_question_id uuid;
  selected_topic_id uuid;
  selected_chapter_id uuid;
  option_count integer;
  correct_option_count integer;
  distinct_option_count integer;
  candidate_dedupe_key text;
  created_count integer := 0;
  skipped_count integer := 0;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1 from public.modules
    where id = target_module_id
      and user_id = owner_id
      and trash_id is null
  ) then
    raise exception 'Moduł nie istnieje lub jest niedostępny.';
  end if;
  if pg_catalog.jsonb_typeof(generated_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(generated_questions) < 1
    or pg_catalog.jsonb_array_length(generated_questions) > 500
  then
    raise exception 'Można zatwierdzić od 1 do 500 pytań jednocześnie.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );

  for generated_question in
    select value from pg_catalog.jsonb_array_elements(generated_questions)
  loop
    if pg_catalog.jsonb_typeof(generated_question) is distinct from 'object'
      or pg_catalog.jsonb_typeof(generated_question -> 'topicId') is distinct from 'string'
      or pg_catalog.btrim(coalesce(generated_question ->> 'content', '')) = ''
      or pg_catalog.length(pg_catalog.btrim(generated_question ->> 'content')) > 10000
      or pg_catalog.length(pg_catalog.btrim(coalesce(generated_question ->> 'explanation', ''))) > 20000
      or pg_catalog.jsonb_typeof(generated_question -> 'options') is distinct from 'array'
    then
      raise exception 'Nieprawidłowe pytanie wygenerowane przez AI.';
    end if;

    begin
      selected_topic_id := (generated_question ->> 'topicId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Nieprawidłowy identyfikator tematu.';
    end;

    select chapter.id
      into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = owner_id
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
    where topic.id = selected_topic_id
      and topic.user_id = owner_id
      and topic.trash_id is null;
    if selected_chapter_id is null then
      raise exception 'Temat pytania nie istnieje lub jest niedostępny.';
    end if;

    option_count := pg_catalog.jsonb_array_length(generated_question -> 'options');
    if option_count < 1 or option_count > 20 then
      raise exception 'Pytanie musi mieć od 1 do 20 odpowiedzi.';
    end if;

    correct_option_count := 0;
    for generated_option in
      select value
      from pg_catalog.jsonb_array_elements(generated_question -> 'options')
    loop
      if pg_catalog.jsonb_typeof(generated_option) is distinct from 'object'
        or pg_catalog.btrim(coalesce(generated_option ->> 'content', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(generated_option ->> 'content')) > 10000
        or pg_catalog.jsonb_typeof(generated_option -> 'isCorrect') is distinct from 'boolean'
      then
        raise exception 'Nieprawidłowa odpowiedź w pytaniu wygenerowanym przez AI.';
      end if;
      if (generated_option ->> 'isCorrect')::boolean then
        correct_option_count := correct_option_count + 1;
      end if;
    end loop;
    if correct_option_count <> 1 then
      raise exception 'Pytanie musi mieć dokładnie jedną poprawną odpowiedź.';
    end if;

    select pg_catalog.count(distinct private.normalize_question_duplicate_text(value ->> 'content'))
      into distinct_option_count
    from pg_catalog.jsonb_array_elements(generated_question -> 'options');
    if distinct_option_count <> option_count then
      raise exception 'Odpowiedzi w pytaniu nie mogą się powtarzać.';
    end if;

    candidate_dedupe_key := private.question_dedupe_key(
      generated_question ->> 'content',
      generated_question -> 'options'
    );
    if exists (
      select 1 from public.questions
      where user_id = owner_id
        and module_id = target_module_id
        and trash_id is null
        and dedupe_key = candidate_dedupe_key
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    begin
      insert into public.questions (
        user_id, module_id, chapter_id, topic_id,
        content, explanation, dedupe_key
      ) values (
        owner_id, target_module_id, selected_chapter_id, selected_topic_id,
        pg_catalog.btrim(generated_question ->> 'content'),
        nullif(pg_catalog.btrim(generated_question ->> 'explanation'), ''),
        candidate_dedupe_key
      ) returning id into saved_question_id;

      for option_record in
        select value, ordinality
        from pg_catalog.jsonb_array_elements(generated_question -> 'options')
          with ordinality
      loop
        insert into public.question_options (
          user_id, question_id, content, is_correct, position
        ) values (
          owner_id,
          saved_question_id,
          pg_catalog.btrim(option_record.value ->> 'content'),
          (option_record.value ->> 'isCorrect')::boolean,
          option_record.ordinality
        );
      end loop;
      created_count := created_count + 1;
    exception when unique_violation then
      skipped_count := skipped_count + 1;
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'created', created_count,
    'duplicatesSkipped', skipped_count
  );
end;
$$;


ALTER FUNCTION "public"."approve_ai_generated_questions"("target_module_id" "uuid", "generated_questions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_assign_questions"("target_module_id" "uuid", "question_ids" "uuid"[], "selected_chapter_id" "uuid", "selected_topic_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  requested_count integer;
  updated_count integer;
begin
  requested_count := coalesce(pg_catalog.cardinality(question_ids), 0);

  if owner_id is null then
    raise exception 'Musisz być zalogowany.';
  end if;
  if requested_count < 1 or requested_count > 500 then
    raise exception 'Wybierz od 1 do 500 pytań.';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(question_ids) as ids(question_id)
    where ids.question_id is null
  ) or (
    select pg_catalog.count(distinct ids.question_id)
    from pg_catalog.unnest(question_ids) as ids(question_id)
  ) <> requested_count
  then
    raise exception 'Lista pytań zawiera nieprawidłowe lub powtórzone identyfikatory.';
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

  if selected_topic_id is not null then
    select topic.chapter_id
    into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = selected_topic_id
      and topic.user_id = owner_id
      and topic.trash_id is null
      and chapter.user_id = owner_id
      and chapter.module_id = target_module_id
      and chapter.trash_id is null;

    if selected_chapter_id is null then
      raise exception 'Nie znaleziono tematu w module.';
    end if;
  elsif selected_chapter_id is null or not exists (
    select 1
    from public.chapters as chapter
    where chapter.id = selected_chapter_id
      and chapter.user_id = owner_id
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
  ) then
    raise exception 'Nie znaleziono rozdziału w module.';
  end if;

  update public.questions as question
  set chapter_id = selected_chapter_id,
      topic_id = selected_topic_id,
      updated_at = pg_catalog.now()
  where question.id = any(question_ids)
    and question.user_id = owner_id
    and question.module_id = target_module_id
    and question.trash_id is null;
  get diagnostics updated_count = row_count;

  if updated_count <> requested_count then
    raise exception 'Nie znaleziono wszystkich wybranych pytań w module.';
  end if;

  return updated_count;
end;
$$;


ALTER FUNCTION "public"."bulk_assign_questions"("target_module_id" "uuid", "question_ids" "uuid"[], "selected_chapter_id" "uuid", "selected_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_chapter_with_topics"("target_module_id" "uuid", "new_chapter" "jsonb", "new_topics" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_chapter_with_topics"("target_module_id" "uuid", "new_chapter" "jsonb", "new_topics" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_fsrs_study_session"("target_module_id" "uuid", "requested_question_count" integer DEFAULT 10, "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  created_id uuid;
  inserted_count integer;
  today date;
begin
  if requested_question_count not between 1 and 100
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name)
    or not exists (select 1 from public.modules where id = target_module_id
      and user_id = (select auth.uid()) and trash_id is null)
  then raise exception 'Nieprawidłowa konfiguracja sesji.'; end if;

  today := timezone(timezone_name, now())::date;
  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values ((select auth.uid()), target_module_id, 'flashcards',
    jsonb_build_object('scope', 'fsrs_due', 'timeLimitMinutes', 10))
  returning id into created_id;

  with candidates as (
    select question.id, question.content, question.explanation,
      question.chapter_id, question.topic_id, chapter.title as chapter_title,
      topic.title as topic_title,
      jsonb_agg(jsonb_build_object('id', option.id, 'content', option.content,
        'isCorrect', option.is_correct) order by option.position) as option_data,
      review.due_at, review.difficulty
    from public.questions as question
    join public.question_options as option on option.question_id = question.id
      and option.user_id = (select auth.uid())
    left join public.chapters as chapter on chapter.id = question.chapter_id
      and chapter.trash_id is null
    left join public.topics as topic on topic.id = question.topic_id
      and topic.trash_id is null
    left join public.question_review_states as review
      on review.user_id = question.user_id and review.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.module_id = target_module_id and question.trash_id is null
      and (review.question_id is null or review.due_at <= now())
      and not exists (
        select 1 from public.study_task_deferrals as deferral
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'question'
          and deferral.task_id = question.id
          and deferral.deferred_until > today
      )
    group by question.id, chapter.title, topic.title,
      review.question_id, review.due_at, review.difficulty
    order by case when review.question_id is not null then 0 else 1 end,
      review.due_at nulls last, review.difficulty desc nulls last, random()
    limit requested_question_count
  )
  insert into public.study_session_items (
    user_id, session_id, question_id, position, question_snapshot,
    options_snapshot, explanation_snapshot, chapter_id_snapshot,
    topic_id_snapshot, chapter_title_snapshot, topic_title_snapshot
  ) select (select auth.uid()), created_id, id,
    row_number() over ()::integer, content, option_data, explanation,
    chapter_id, topic_id, chapter_title, topic_title from candidates;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań wymagających powtórki.';
  end if;
  return created_id;
end;
$$;


ALTER FUNCTION "public"."create_fsrs_study_session"("target_module_id" "uuid", "requested_question_count" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid" DEFAULT NULL::"uuid", "selected_topic_id" "uuid" DEFAULT NULL::"uuid", "random_chapter_count" integer DEFAULT 3, "requested_question_count" integer DEFAULT 20, "hide_flashcard_options" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  created_id uuid;
  inserted_count integer;
begin
  if study_mode not in ('flashcards', 'test')
    or scope_mode not in ('chapter', 'topic', 'all', 'random_chapters', 'unassigned')
    or not exists (
      select 1
      from public.modules
      where id = target_module_id
        and user_id = (select auth.uid())
        and trash_id is null
    )
  then
    raise exception 'Nieprawidłowa konfiguracja sesji.';
  end if;

  insert into public.study_sessions (user_id, module_id, mode, configuration)
  values (
    (select auth.uid()),
    target_module_id,
    study_mode,
    pg_catalog.jsonb_build_object(
      'scope', scope_mode,
      'chapterId', selected_chapter_id,
      'topicId', selected_topic_id,
      'hideFlashcardOptions',
        study_mode = 'flashcards' and coalesce(hide_flashcard_options, false)
    )
  )
  returning id into created_id;

  with random_chapters as materialized (
    select chapter.id
    from public.chapters as chapter
    where chapter.user_id = (select auth.uid())
      and chapter.module_id = target_module_id
      and chapter.trash_id is null
      and exists (
        select 1
        from public.questions as question
        join public.question_options as option
          on option.question_id = question.id
          and option.user_id = (select auth.uid())
        where question.chapter_id = chapter.id
          and question.user_id = (select auth.uid())
          and question.module_id = target_module_id
          and question.trash_id is null
        group by question.id
        having study_mode = 'flashcards' or pg_catalog.count(option.id) >= 2
      )
    order by pg_catalog.random()
    limit greatest(1, random_chapter_count)
  ), candidates as (
    select
      question.id,
      question.content,
      question.explanation,
      question.chapter_id,
      question.topic_id,
      chapter.title as chapter_title,
      topic.title as topic_title,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', option.id,
          'content', option.content,
          'isCorrect', option.is_correct
        )
        order by option.position
      ) as option_data
    from public.questions as question
    join public.question_options as option
      on option.question_id = question.id
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
    group by question.id, chapter.title, topic.title
    having study_mode = 'flashcards' or pg_catalog.count(option.id) >= 2
    order by pg_catalog.random()
    limit greatest(1, requested_question_count)
  )
  insert into public.study_session_items (
    user_id,
    session_id,
    question_id,
    position,
    question_snapshot,
    options_snapshot,
    explanation_snapshot,
    chapter_id_snapshot,
    topic_id_snapshot,
    chapter_title_snapshot,
    topic_title_snapshot
  )
  select
    (select auth.uid()),
    created_id,
    id,
    pg_catalog.row_number() over ()::integer,
    content,
    option_data,
    explanation,
    chapter_id,
    topic_id,
    chapter_title,
    topic_title
  from candidates;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    delete from public.study_sessions where id = created_id;
    raise exception 'Brak pytań dla wybranego trybu.';
  end if;

  return created_id;
end;
$$;


ALTER FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer, "hide_flashcard_options" boolean) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_ai_question_generation_topics"("target_module_id" "uuid", "selected_topic_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  requested_count integer;
  result jsonb;
begin
  if owner_id is null then
    raise exception 'Użytkownik nie jest zalogowany.';
  end if;
  if not exists (
    select 1 from public.modules
    where id = target_module_id
      and user_id = owner_id
      and trash_id is null
  ) then
    raise exception 'Moduł nie istnieje lub jest niedostępny.';
  end if;

  requested_count := coalesce(pg_catalog.cardinality(selected_topic_ids), 0);
  if requested_count < 1 or requested_count > 50
    or (
      select pg_catalog.count(distinct topic_id)
      from pg_catalog.unnest(selected_topic_ids) as topic_id
    ) <> requested_count
  then
    raise exception 'Wybierz od 1 do 50 różnych tematów.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', topic.id,
        'title', topic.title,
        'content', topic.content,
        'chapterId', chapter.id,
        'chapterTitle', chapter.title
      ) order by chapter.position, chapter.id, topic.position, topic.id
    ),
    '[]'::jsonb
  )
  into result
  from public.topics as topic
  join public.chapters as chapter
    on chapter.id = topic.chapter_id
    and chapter.user_id = owner_id
    and chapter.module_id = target_module_id
    and chapter.trash_id is null
  where topic.user_id = owner_id
    and topic.trash_id is null
    and topic.id = any(selected_topic_ids);

  if pg_catalog.jsonb_array_length(result) <> requested_count then
    raise exception 'Co najmniej jeden temat nie istnieje lub jest niedostępny.';
  end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_ai_question_generation_topics"("target_module_id" "uuid", "selected_topic_ids" "uuid"[]) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_exam_planning_chapters"("target_module_id" "uuid", "search_query" "text" DEFAULT NULL::"text", "after_position" bigint DEFAULT NULL::bigint, "after_id" "uuid" DEFAULT NULL::"uuid", "result_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  result_value jsonb;
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ) or result_limit is null
  or result_limit not between 1 and 100
  or (search_query is not null and length(trim(search_query)) < 2)
  or ((after_position is null) <> (after_id is null))
  then
    raise exception 'Nieprawidłowe parametry listy rozdziałów.';
  end if;

  with matching_chapters as (
    select chapter.id,
      chapter.title,
      chapter.position,
      count(topic.id)::integer as topic_count,
      count(topic.id) filter (where not topic.completed)::integer
        as unfinished_topic_count
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = chapter.user_id
      and topic.trash_id is null
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and (
        search_query is null
        or lower(chapter.title) like '%' || lower(trim(search_query)) || '%'
        or exists (
          select 1
          from public.topics as matching_topic
          where matching_topic.chapter_id = chapter.id
            and matching_topic.user_id = chapter.user_id
            and matching_topic.trash_id is null
            and lower(matching_topic.title)
              like '%' || lower(trim(search_query)) || '%'
        )
      )
    group by chapter.id, chapter.title, chapter.position
  ),
  counted_chapters as (
    select chapter.*,
      count(*) over ()::integer as total_count
    from matching_chapters as chapter
  ),
  page as (
    select chapter.*
    from counted_chapters as chapter
    where after_position is null
      or (chapter.position, chapter.id) > (after_position, after_id)
    order by chapter.position, chapter.id
    limit result_limit + 1
  ),
  visible_page as (
    select chapter.*
    from page as chapter
    order by chapter.position, chapter.id
    limit result_limit
  )
  select jsonb_build_object(
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', chapter.id,
        'title', chapter.title,
        'position', chapter.position,
        'topicCount', chapter.topic_count,
        'unfinishedTopicCount', chapter.unfinished_topic_count
      ) order by chapter.position, chapter.id)
      from visible_page as chapter
    ), '[]'::jsonb),
    'totalCount', coalesce((
      select max(chapter.total_count) from counted_chapters as chapter
    ), 0),
    'hasMore', (select count(*) > result_limit from page),
    'nextCursor', case
      when (select count(*) > result_limit from page) then (
        select jsonb_build_object(
          'position', chapter.position,
          'id', chapter.id
        )
        from visible_page as chapter
        order by chapter.position desc, chapter.id desc
        limit 1
      )
      else null
    end
  ) into result_value;

  return result_value;
end;
$$;


ALTER FUNCTION "public"."get_exam_planning_chapters"("target_module_id" "uuid", "search_query" "text", "after_position" bigint, "after_id" "uuid", "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exam_planning_scope"("target_module_id" "uuid", "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  result_value jsonb;
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ) or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = timezone_name
  ) then
    raise exception 'Nieprawidłowy moduł lub strefa czasowa.';
  end if;

  with module_stats as (
    select count(distinct chapter.id)::integer as chapter_count,
      count(topic.id)::integer as topic_count,
      count(topic.id) filter (where not topic.completed)::integer
        as unfinished_topic_count
    from public.chapters as chapter
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = chapter.user_id
      and topic.trash_id is null
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
  ),
  unassigned_questions as (
    select question.id, review_state.due_at
    from public.questions as question
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.module_id = target_module_id
      and question.user_id = (select auth.uid())
      and question.topic_id is null
      and question.trash_id is null
  ),
  unassigned_due_date_counts as (
    select to_char(
        timezone(timezone_name, question.due_at),
        'YYYY-MM-DD'
      ) as due_date,
      count(*)::integer as due_count
    from unassigned_questions as question
    where question.due_at is not null
    group by 1
  ),
  recent_durations as (
    select item.active_duration_seconds
    from public.study_session_items as item
    where item.user_id = (select auth.uid())
      and item.answered_at is not null
      and item.active_duration_seconds between 1 and 600
    order by item.answered_at desc
    limit 200
  ),
  ranked_durations as (
    select duration.active_duration_seconds,
      row_number() over (order by duration.active_duration_seconds)
        as sample_rank,
      count(*) over () as sample_count
    from recent_durations as duration
  ),
  pace as (
    select count(*)::integer as sample_size,
      coalesce(round(avg(ranked.active_duration_seconds) filter (
        where ranked.sample_count < 10
          or (
            ranked.sample_rank > floor(ranked.sample_count * 0.1)
            and ranked.sample_rank
              <= ranked.sample_count - floor(ranked.sample_count * 0.1)
          )
      )), 45)::integer as seconds_per_question
    from ranked_durations as ranked
  )
  select jsonb_build_object(
    'chapterCount', stats.chapter_count,
    'topicCount', stats.topic_count,
    'unfinishedTopicCount', stats.unfinished_topic_count,
    'unassignedQuestionCount', (
      select count(*)::integer from unassigned_questions
    ),
    'unassignedDueReviewCount', (
      select count(*) filter (where question.due_at <= now())::integer
      from unassigned_questions as question
    ),
    'unassignedReviewDueDateCounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', due.due_date,
        'count', due.due_count
      ) order by due.due_date)
      from unassigned_due_date_counts as due
    ), '[]'::jsonb),
    'reviewSecondsPerQuestion', pace.seconds_per_question,
    'paceSampleSize', pace.sample_size
  ) into result_value
  from pace
  cross join module_stats as stats;

  return result_value;
end;
$$;


ALTER FUNCTION "public"."get_exam_planning_scope"("target_module_id" "uuid", "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exam_planning_topics"("target_module_id" "uuid", "target_chapter_ids" "uuid"[] DEFAULT NULL::"uuid"[], "timezone_name" "text" DEFAULT 'UTC'::"text", "search_query" "text" DEFAULT NULL::"text", "result_limit" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  result_value jsonb;
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ) or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = timezone_name
  ) or (result_limit is not null and result_limit not between 1 and 100)
  or (search_query is not null and length(trim(search_query)) < 2)
  then
    raise exception 'Nieprawidłowe parametry zakresu egzaminu.';
  end if;

  with matching_topics as (
    select topic.id,
      topic.chapter_id,
      chapter.title as chapter_title,
      chapter.position as chapter_position,
      topic.title,
      topic.completed,
      topic.position,
      topic.content
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and topic.trash_id is null
      and (
        target_chapter_ids is null
        or topic.chapter_id = any(target_chapter_ids)
      )
      and (
        search_query is null
        or lower(topic.title) like '%' || lower(trim(search_query)) || '%'
        or lower(chapter.title) like '%' || lower(trim(search_query)) || '%'
      )
    order by chapter.position, topic.position, topic.id
    limit result_limit
  ),
  selected_topics as (
    select topic.id,
      topic.chapter_id,
      topic.chapter_title,
      topic.chapter_position,
      topic.title,
      topic.completed,
      topic.position,
      case
        when length(topic.content::text) < 800 then 1
        when length(topic.content::text) < 2500 then 2
        when length(topic.content::text) < 6000 then 4
        else 6
      end as workload_points
    from matching_topics as topic
  ),
  question_stats as (
    select question.topic_id,
      count(*)::integer as question_count,
      count(*) filter (where review_state.due_at <= now())::integer
        as due_review_count
    from public.questions as question
    join selected_topics as topic on topic.id = question.topic_id
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id
  ),
  review_due_date_counts as (
    select question.topic_id,
      to_char(
        timezone(timezone_name, review_state.due_at),
        'YYYY-MM-DD'
      ) as due_date,
      count(*)::integer as due_count
    from public.questions as question
    join selected_topics as topic on topic.id = question.topic_id
    join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id, 2
  ),
  review_due_stats as (
    select due.topic_id,
      jsonb_agg(jsonb_build_object(
        'date', due.due_date,
        'count', due.due_count
      ) order by due.due_date) as review_due_date_counts
    from review_due_date_counts as due
    group by due.topic_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', topic.id,
    'chapterId', topic.chapter_id,
    'chapterTitle', topic.chapter_title,
    'title', topic.title,
    'completed', topic.completed,
    'workloadPoints', topic.workload_points,
    'workloadSource', 'automatic',
    'questionCount', coalesce(stats.question_count, 0),
    'dueReviewCount', coalesce(stats.due_review_count, 0),
    'reviewDueDateCounts', coalesce(
      due.review_due_date_counts,
      '[]'::jsonb
    )
  ) order by
    topic.chapter_position,
    topic.position,
    topic.id
  ), '[]'::jsonb) into result_value
  from selected_topics as topic
  left join question_stats as stats on stats.topic_id = topic.id
  left join review_due_stats as due on due.topic_id = topic.id;

  return result_value;
end;
$$;


ALTER FUNCTION "public"."get_exam_planning_topics"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exam_planning_topics_page"("target_module_id" "uuid", "target_chapter_ids" "uuid"[] DEFAULT NULL::"uuid"[], "timezone_name" "text" DEFAULT 'UTC'::"text", "search_query" "text" DEFAULT NULL::"text", "after_chapter_position" bigint DEFAULT NULL::bigint, "after_topic_position" bigint DEFAULT NULL::bigint, "after_id" "uuid" DEFAULT NULL::"uuid", "result_limit" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  result_value jsonb;
begin
  if not exists (
    select 1
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ) or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = timezone_name
  ) or result_limit is null
  or result_limit not between 1 and 100
  or (search_query is not null and length(trim(search_query)) < 2)
  or num_nonnulls(
    after_chapter_position,
    after_topic_position,
    after_id
  ) not in (0, 3)
  then
    raise exception 'Nieprawidłowe parametry listy tematów.';
  end if;

  with matching_topics as (
    select topic.id,
      topic.chapter_id,
      chapter.title as chapter_title,
      chapter.position as chapter_position,
      topic.title,
      topic.completed,
      topic.position,
      topic.content
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id
    where chapter.module_id = target_module_id
      and chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
      and topic.trash_id is null
      and (
        target_chapter_ids is null
        or topic.chapter_id = any(target_chapter_ids)
      )
      and (
        search_query is null
        or lower(topic.title) like '%' || lower(trim(search_query)) || '%'
        or lower(chapter.title) like '%' || lower(trim(search_query)) || '%'
      )
      and (
        after_chapter_position is null
        or (chapter.position, topic.position, topic.id) > (
          after_chapter_position,
          after_topic_position,
          after_id
        )
      )
    order by chapter.position, topic.position, topic.id
    limit result_limit + 1
  ),
  visible_topics as (
    select topic.*,
      case
        when length(topic.content::text) < 800 then 1
        when length(topic.content::text) < 2500 then 2
        when length(topic.content::text) < 6000 then 4
        else 6
      end as workload_points
    from matching_topics as topic
    order by topic.chapter_position, topic.position, topic.id
    limit result_limit
  ),
  question_stats as (
    select question.topic_id,
      count(*)::integer as question_count,
      count(*) filter (where review_state.due_at <= now())::integer
        as due_review_count
    from public.questions as question
    join visible_topics as topic on topic.id = question.topic_id
    left join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id
  ),
  review_due_date_counts as (
    select question.topic_id,
      to_char(
        timezone(timezone_name, review_state.due_at),
        'YYYY-MM-DD'
      ) as due_date,
      count(*)::integer as due_count
    from public.questions as question
    join visible_topics as topic on topic.id = question.topic_id
    join public.question_review_states as review_state
      on review_state.user_id = question.user_id
      and review_state.question_id = question.id
    where question.user_id = (select auth.uid())
      and question.trash_id is null
    group by question.topic_id, 2
  ),
  review_due_stats as (
    select due.topic_id,
      jsonb_agg(jsonb_build_object(
        'date', due.due_date,
        'count', due.due_count
      ) order by due.due_date) as review_due_date_counts
    from review_due_date_counts as due
    group by due.topic_id
  )
  select jsonb_build_object(
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', topic.id,
        'chapterId', topic.chapter_id,
        'chapterTitle', topic.chapter_title,
        'title', topic.title,
        'completed', topic.completed,
        'workloadPoints', topic.workload_points,
        'workloadSource', 'automatic',
        'questionCount', coalesce(stats.question_count, 0),
        'dueReviewCount', coalesce(stats.due_review_count, 0),
        'reviewDueDateCounts', coalesce(
          due.review_due_date_counts,
          '[]'::jsonb
        )
      ) order by topic.chapter_position, topic.position, topic.id)
      from visible_topics as topic
      left join question_stats as stats on stats.topic_id = topic.id
      left join review_due_stats as due on due.topic_id = topic.id
    ), '[]'::jsonb),
    'hasMore', (select count(*) > result_limit from matching_topics),
    'nextCursor', case
      when (select count(*) > result_limit from matching_topics) then (
        select jsonb_build_object(
          'chapterPosition', topic.chapter_position,
          'topicPosition', topic.position,
          'id', topic.id
        )
        from visible_topics as topic
        order by topic.chapter_position desc, topic.position desc, topic.id desc
        limit 1
      )
      else null
    end
  ) into result_value;

  return result_value;
end;
$$;


ALTER FUNCTION "public"."get_exam_planning_topics_page"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "after_chapter_position" bigint, "after_topic_position" bigint, "after_id" "uuid", "result_limit" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_offline_module_changes"("target_module_id" "uuid", "changed_since" timestamp with time zone DEFAULT NULL::timestamp with time zone, "include_images" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with sync_boundary as (
    -- Keep a small overlap so a transaction that started before this snapshot
    -- and commits just after it cannot fall behind the next cursor.
    select statement_timestamp() - interval '1 minute' as server_time
  ), selected_module as (
    select module.id, module.slug, module.name, module.is_pinned,
      module.position, module.updated_at
    from public.modules as module
    where module.id = target_module_id
      and module.user_id = (select auth.uid())
      and module.trash_id is null
  ), active_chapters as (
    select chapter.id, chapter.module_id, chapter.slug, chapter.title,
      chapter.position, chapter.updated_at
    from public.chapters as chapter
    join selected_module as module on module.id = chapter.module_id
    where chapter.user_id = (select auth.uid())
      and chapter.trash_id is null
  ), active_topics as (
    select topic.id, topic.chapter_id, topic.slug, topic.title, topic.content,
      topic.completed, topic.position, topic.updated_at
    from public.topics as topic
    join active_chapters as chapter on chapter.id = topic.chapter_id
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null
  ), active_images as (
    select image.id, image.topic_id, image.storage_key,
      image.original_filename, image.format, image.width, image.height,
      image.bytes, image.position, image.updated_at
    from public.topic_images as image
    join active_topics as topic on topic.id = image.topic_id
    where include_images
      and image.user_id = (select auth.uid())
      and image.trash_id is null
  )
  select jsonb_build_object(
    'serverTime', boundary.server_time,
    'module', jsonb_build_object(
      'id', module.id,
      'slug', module.slug,
      'name', module.name,
      'isPinned', module.is_pinned,
      'position', module.position,
      'updatedAt', module.updated_at
    ),
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', chapter.id,
        'moduleId', chapter.module_id,
        'slug', chapter.slug,
        'title', chapter.title,
        'position', chapter.position,
        'updatedAt', chapter.updated_at
      ) order by chapter.position, chapter.id)
      from active_chapters as chapter
      where changed_since is null or chapter.updated_at > changed_since
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', topic.id,
        'chapterId', topic.chapter_id,
        'slug', topic.slug,
        'title', topic.title,
        'content', topic.content,
        'completed', topic.completed,
        'position', topic.position,
        'updatedAt', topic.updated_at
      ) order by topic.chapter_id, topic.position, topic.id)
      from active_topics as topic
      where changed_since is null or topic.updated_at > changed_since
    ), '[]'::jsonb),
    'activeChapterIds', coalesce((
      select jsonb_agg(chapter.id order by chapter.id)
      from active_chapters as chapter
    ), '[]'::jsonb),
    'activeTopicIds', coalesce((
      select jsonb_agg(topic.id order by topic.id)
      from active_topics as topic
    ), '[]'::jsonb),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', image.id,
        'topicId', image.topic_id,
        'storageKey', image.storage_key,
        'originalFilename', image.original_filename,
        'format', image.format,
        'width', image.width,
        'height', image.height,
        'bytes', image.bytes,
        'position', image.position,
        'updatedAt', image.updated_at
      ) order by image.topic_id, image.position, image.id)
      from active_images as image
    ), '[]'::jsonb)
  )
  from selected_module as module
  cross join sync_boundary as boundary;
$$;


ALTER FUNCTION "public"."get_offline_module_changes"("target_module_id" "uuid", "changed_since" timestamp with time zone, "include_images" boolean) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_question_duplicate_status"("target_module_id" "uuid", "excluded_question_id" "uuid", "question_content" "text", "options" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with candidate as (
    select
      private.normalize_question_duplicate_text(question_content) as normalized_content,
      private.question_dedupe_key(question_content, options) as dedupe_key
  )
  select pg_catalog.jsonb_build_object(
    'kind', case
      when question.dedupe_key = candidate.dedupe_key then 'exact'
      else 'same_content'
    end,
    'questionId', question.id
  )
  from public.questions as question
  cross join candidate
  where question.user_id = (select auth.uid())
    and question.module_id = target_module_id
    and question.trash_id is null
    and question.id is distinct from excluded_question_id
    and private.normalize_question_duplicate_text(question.content)
      = candidate.normalized_content
  order by (question.dedupe_key = candidate.dedupe_key) desc nulls last,
    question.created_at,
    question.id
  limit 1;
$$;


ALTER FUNCTION "public"."get_question_duplicate_status"("target_module_id" "uuid", "excluded_question_id" "uuid", "question_content" "text", "options" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_study_assessment"("target_module_id" "uuid" DEFAULT NULL::"uuid", "range_days" integer DEFAULT 30, "timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  response_payload jsonb;
begin
  if (select auth.uid()) is null
    or range_days not in (0, 7, 30, 90)
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
    raise exception 'Nieprawidłowe filtry oceny nauki.';
  end if;

  with answers as (
    select
      session.mode,
      item.result as answer_result,
      review.rating
    from public.study_sessions as session
    join public.study_session_items as item
      on item.session_id = session.id
      and item.user_id = session.user_id
    left join public.question_review_logs as review
      on review.session_item_id = item.id
      and review.user_id = session.user_id
    where session.user_id = (select auth.uid())
      and session.trash_id is null
      and item.result is not null
      and (target_module_id is null or session.module_id = target_module_id)
      and (
        range_days = 0
        or timezone(timezone_name, item.answered_at)::date
          >= timezone(timezone_name, now())::date - (range_days - 1)
      )
  ), assessment as (
    select
      count(*) filter (where answers.mode = 'test')::integer as test_answers,
      count(*) filter (
        where answers.mode = 'test' and answers.answer_result = 'correct'
      )::integer as test_correct,
      count(*) filter (
        where answers.mode = 'flashcards'
      )::integer as flashcard_answers,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 1
      )::integer as again,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 2
      )::integer as hard,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 3
      )::integer as good,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating = 4
      )::integer as easy,
      count(*) filter (
        where answers.mode = 'flashcards' and answers.rating is null
      )::integer as unrated
    from answers
  )
  select jsonb_build_object(
    'tests', jsonb_build_object(
      'answers', assessment.test_answers,
      'correct', assessment.test_correct,
      'accuracy', case when assessment.test_answers = 0 then 0
        else round(
          assessment.test_correct * 100.0 / assessment.test_answers
        )::integer end
    ),
    'flashcards', jsonb_build_object(
      'answers', assessment.flashcard_answers,
      'again', assessment.again,
      'hard', assessment.hard,
      'good', assessment.good,
      'easy', assessment.easy,
      'unrated', assessment.unrated
    )
  ) into response_payload
  from assessment;

  return response_payload;
end;
$$;


ALTER FUNCTION "public"."get_study_assessment"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_today_dashboard"("timezone_name" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  if (select auth.uid()) is null
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_name)
  then raise exception 'Nieprawidłowe parametry ekranu Dzisiaj.'; end if;

  with
  params as (
    select timezone(timezone_name, now())::date as today
  ),
  module_progress as (
    select module.id, module.name, module.slug, module.exam_date,
      module.is_pinned, module.position,
      count(topic.id)::integer as topics_count,
      count(topic.id) filter (where topic.completed)::integer
        as completed_topics_count
    from public.modules as module
    left join public.chapters as chapter
      on chapter.module_id = module.id
      and chapter.user_id = module.user_id
      and chapter.trash_id is null
    left join public.topics as topic
      on topic.chapter_id = chapter.id
      and topic.user_id = module.user_id
      and topic.trash_id is null
    where module.user_id = (select auth.uid())
      and module.trash_id is null
    group by module.id
  ),
  due_question_rows as (
    select question.id, question.content, module.id as module_id,
      module.name as module_name, module.slug as module_slug,
      chapter.title as chapter_title, topic.title as topic_title,
      timezone(timezone_name, coalesce(review.due_at, now()))::date as due_on,
      review.due_at,
      case
        when review.question_id is null or review.state = 'new' then 'new'
        when review.state in ('learning', 'relearning') then 'learning'
        when review.due_at < now() then 'overdue'
        else 'mastered'
      end as learning_status
    from public.questions as question
    join public.modules as module on module.id = question.module_id
      and module.user_id = question.user_id and module.trash_id is null
    left join public.chapters as chapter on chapter.id = question.chapter_id
      and chapter.trash_id is null
    left join public.topics as topic on topic.id = question.topic_id
      and topic.trash_id is null
    left join public.question_review_states as review
      on review.user_id = question.user_id and review.question_id = question.id
    cross join params
    where question.user_id = (select auth.uid()) and question.trash_id is null
      and (review.question_id is null or review.due_at <= now())
      and exists (select 1 from public.question_options as option
        where option.question_id = question.id
          and option.user_id = (select auth.uid()))
      and not exists (
        select 1 from public.study_task_deferrals as deferral
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'question'
          and deferral.task_id = question.id
          and deferral.deferred_until > params.today
      )
  ),
  due_questions as (
    select * from due_question_rows
    order by due_at nulls first, id
    limit 8
  ),
  recommended_topics as (
    select topic.id, topic.title, topic.slug, chapter.title as chapter_title,
      chapter.slug as chapter_slug,
      module.id as module_id, module.name as module_name,
      module.slug as module_slug
    from public.topics as topic
    join public.chapters as chapter
      on chapter.id = topic.chapter_id
      and chapter.user_id = topic.user_id and chapter.trash_id is null
    join public.modules as module
      on module.id = chapter.module_id
      and module.user_id = topic.user_id and module.trash_id is null
    cross join params
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null and not topic.completed
      and not exists (
        select 1 from public.study_task_deferrals as deferral
        where deferral.user_id = (select auth.uid())
          and deferral.task_type = 'topic'
          and deferral.task_id = topic.id
          and deferral.deferred_until > params.today
      )
    order by module.exam_date asc nulls last, module.is_pinned desc,
      module.position, chapter.position, topic.position, topic.id
    limit 5
  ),
  nearest_exam as (
    select module.* from module_progress as module, params
    where module.exam_date >= params.today
    order by module.exam_date, module.position, module.id
    limit 1
  ),
  weekly_progress as (
    select count(*)::integer as completed
    from public.topics as topic, params
    where topic.user_id = (select auth.uid())
      and topic.trash_id is null and topic.completed
      and timezone(timezone_name, topic.first_completed_at)::date
        >= date_trunc('week', params.today)::date
      and timezone(timezone_name, topic.first_completed_at)::date <= params.today
  ),
  recent_summary as (
    select session.id, session.completed_at,
      count(item.id) filter (where item.result is not null)::integer as answers,
      count(item.id) filter (
        where item.result in ('correct', 'remembered'))::integer as successful,
      coalesce(sum(item.active_duration_seconds), 0)::integer as duration_seconds
    from public.study_sessions as session
    join public.study_session_items as item on item.session_id = session.id
    cross join params
    where session.user_id = (select auth.uid())
      and session.trash_id is null and session.status = 'completed'
      and timezone(timezone_name, session.completed_at)::date = params.today
    group by session.id
    order by session.completed_at desc
    limit 1
  ),
  session_target as (
    select module_id, module_name, module_slug from due_question_rows
    group by module_id, module_name, module_slug
    order by count(*) desc, module_name
    limit 1
  )
  select jsonb_build_object(
    'date', (select today from params),
    'dueQuestionCount', (select count(*)::integer from due_question_rows),
    'dueQuestions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'content', content, 'moduleId', module_id,
      'moduleName', module_name, 'moduleSlug', module_slug,
      'chapterTitle', chapter_title, 'topicTitle', topic_title,
      'dueOn', due_on, 'learningStatus', learning_status
    ) order by due_at nulls first, id) from due_questions), '[]'::jsonb),
    'recommendedTopics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'topicSlug', slug,
      'chapterTitle', chapter_title, 'chapterSlug', chapter_slug,
      'moduleId', module_id, 'moduleName', module_name,
      'moduleSlug', module_slug
    )) from recommended_topics), '[]'::jsonb),
    'nearestExam', (select jsonb_build_object(
      'moduleId', id, 'moduleName', name, 'moduleSlug', slug,
      'examDate', exam_date, 'topicsCount', topics_count,
      'completedTopicsCount', completed_topics_count
    ) from nearest_exam),
    'weeklyGoal', jsonb_build_object(
      'target', coalesce((select weekly_topics from public.study_goals
        where user_id = (select auth.uid())), 5),
      'enabled', coalesce((select weekly_topics_enabled from public.study_goals
        where user_id = (select auth.uid())), true),
      'completed', (select completed from weekly_progress)
    ),
    'recentSummary', (select jsonb_build_object(
      'sessionId', id, 'completedAt', completed_at, 'answers', answers,
      'successful', successful, 'durationSeconds', duration_seconds
    ) from recent_summary),
    'sessionTarget', (select jsonb_build_object(
      'moduleId', module_id, 'moduleName', module_name,
      'moduleSlug', module_slug) from session_target),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'examDate', exam_date
    ) order by name, id) from module_progress), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_today_dashboard"("timezone_name" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."import_docx_into_module"("target_module_id" "uuid", "imported_chapters" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."import_docx_into_module"("target_module_id" "uuid", "imported_chapters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_docx_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."import_docx_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_learning_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb", "imported_questions" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  module_id uuid;
begin
  module_id := public.import_docx_module(
    target_name,
    target_position,
    imported_chapters
  );
  perform public.import_questions_into_module(module_id, imported_questions);
  return module_id;
end;
$$;


ALTER FUNCTION "public"."import_learning_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb", "imported_questions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_question_module"("target_name" "text", "target_position" bigint, "imported_questions" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  module_id uuid;
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

  perform public.import_questions_into_module(module_id, imported_questions);
  return module_id;
end;
$$;


ALTER FUNCTION "public"."import_question_module"("target_name" "text", "target_position" bigint, "imported_questions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_questions_into_module"("target_module_id" "uuid", "imported_questions" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  question_id uuid;
  imported_question jsonb;
  imported_option jsonb;
  option_record record;
  option_count integer;
  correct_option_count integer;
  distinct_option_count integer;
  chapter_title text;
  topic_title text;
  base_slug text;
  candidate_slug text;
  slug_suffix integer;
  next_position bigint;
  imported_chapter_id uuid;
  imported_topic_id uuid;
  candidate_dedupe_key text;
  imported_count integer := 0;
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

    if (imported_question ? 'chapterTitle'
        and pg_catalog.jsonb_typeof(imported_question -> 'chapterTitle') not in ('string', 'null'))
      or (imported_question ? 'topicTitle'
        and pg_catalog.jsonb_typeof(imported_question -> 'topicTitle') not in ('string', 'null'))
      or (imported_question ? 'chapterSlug'
        and pg_catalog.jsonb_typeof(imported_question -> 'chapterSlug') not in ('string', 'null'))
      or (imported_question ? 'topicSlug'
        and pg_catalog.jsonb_typeof(imported_question -> 'topicSlug') not in ('string', 'null'))
    then
      raise exception 'Nieprawidłowa hierarchia talii Anki.';
    end if;

    chapter_title := nullif(pg_catalog.btrim(imported_question ->> 'chapterTitle'), '');
    topic_title := nullif(pg_catalog.btrim(imported_question ->> 'topicTitle'), '');
    if pg_catalog.length(coalesce(chapter_title, '')) > 10000
      or pg_catalog.length(coalesce(topic_title, '')) > 10000
      or (topic_title is not null and chapter_title is null)
      or (chapter_title is not null and (
        pg_catalog.btrim(coalesce(imported_question ->> 'chapterSlug', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(imported_question ->> 'chapterSlug')) > 500
      ))
      or (topic_title is not null and (
        pg_catalog.btrim(coalesce(imported_question ->> 'topicSlug', '')) = ''
        or pg_catalog.length(pg_catalog.btrim(imported_question ->> 'topicSlug')) > 500
      ))
    then
      raise exception 'Nieprawidłowa hierarchia talii Anki.';
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
      distinct private.normalize_question_duplicate_text(value ->> 'content')
    )
    into distinct_option_count
    from pg_catalog.jsonb_array_elements(imported_question -> 'options');
    if distinct_option_count <> option_count then
      raise exception 'Odpowiedzi w pytaniu nie mogą się powtarzać.';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );

  for imported_question in
    select value from pg_catalog.jsonb_array_elements(imported_questions)
  loop
    candidate_dedupe_key := private.question_dedupe_key(
      imported_question ->> 'content',
      imported_question -> 'options'
    );
    if exists (
      select 1
      from public.questions as existing_question
      where existing_question.user_id = owner_id
        and existing_question.module_id = target_module_id
        and existing_question.trash_id is null
        and existing_question.dedupe_key = candidate_dedupe_key
    ) then
      continue;
    end if;

    chapter_title := nullif(pg_catalog.btrim(imported_question ->> 'chapterTitle'), '');
    topic_title := nullif(pg_catalog.btrim(imported_question ->> 'topicTitle'), '');
    imported_chapter_id := null;
    imported_topic_id := null;

    if chapter_title is not null then
      select chapter.id
      into imported_chapter_id
      from public.chapters as chapter
      where chapter.module_id = target_module_id
        and chapter.user_id = owner_id
        and chapter.trash_id is null
        and private.normalize_question_duplicate_text(chapter.title)
          = private.normalize_question_duplicate_text(chapter_title)
      order by chapter.position, chapter.id
      limit 1;

      if imported_chapter_id is null then
        base_slug := pg_catalog.btrim(imported_question ->> 'chapterSlug');
        candidate_slug := base_slug;
        slug_suffix := 2;
        while exists (
          select 1
          from public.chapters
          where module_id = target_module_id
            and trash_id is null
            and slug = candidate_slug
        ) loop
          candidate_slug := pg_catalog.left(base_slug, 480 - pg_catalog.length(slug_suffix::text))
            || '-' || slug_suffix;
          slug_suffix := slug_suffix + 1;
        end loop;
        select coalesce(pg_catalog.max(position), 0) + 1000
        into next_position
        from public.chapters
        where module_id = target_module_id
          and user_id = owner_id
          and trash_id is null;
        insert into public.chapters (user_id, module_id, slug, title, position)
        values (owner_id, target_module_id, candidate_slug, chapter_title, next_position)
        returning id into imported_chapter_id;
      end if;
    end if;

    if topic_title is not null then
      select topic.id
      into imported_topic_id
      from public.topics as topic
      where topic.chapter_id = imported_chapter_id
        and topic.user_id = owner_id
        and topic.trash_id is null
        and private.normalize_question_duplicate_text(topic.title)
          = private.normalize_question_duplicate_text(topic_title)
      order by topic.position, topic.id
      limit 1;

      if imported_topic_id is null then
        base_slug := pg_catalog.btrim(imported_question ->> 'topicSlug');
        candidate_slug := base_slug;
        slug_suffix := 2;
        while exists (
          select 1
          from public.topics
          where chapter_id = imported_chapter_id
            and trash_id is null
            and slug = candidate_slug
        ) loop
          candidate_slug := pg_catalog.left(base_slug, 480 - pg_catalog.length(slug_suffix::text))
            || '-' || slug_suffix;
          slug_suffix := slug_suffix + 1;
        end loop;
        select coalesce(pg_catalog.max(position), 0) + 1000
        into next_position
        from public.topics
        where chapter_id = imported_chapter_id
          and user_id = owner_id
          and trash_id is null;
        insert into public.topics (user_id, chapter_id, slug, title, position)
        values (owner_id, imported_chapter_id, candidate_slug, topic_title, next_position)
        returning id into imported_topic_id;
      end if;
    end if;

    question_id := gen_random_uuid();
    insert into public.questions (
      id,
      user_id,
      module_id,
      chapter_id,
      topic_id,
      content,
      explanation,
      dedupe_key
    ) values (
      question_id,
      owner_id,
      target_module_id,
      imported_chapter_id,
      imported_topic_id,
      pg_catalog.btrim(imported_question ->> 'content'),
      nullif(pg_catalog.btrim(imported_question ->> 'explanation'), ''),
      candidate_dedupe_key
    )
    on conflict (user_id, module_id, dedupe_key)
      where trash_id is null and dedupe_key is not null
      do nothing;

    if not found then
      continue;
    end if;

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
    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;


ALTER FUNCTION "public"."import_questions_into_module"("target_module_id" "uuid", "imported_questions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "page_cursor_id" "uuid" DEFAULT NULL::"uuid", "requested_page_size" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "item_type" "text", "item_id" "uuid", "title" "text", "deleted_at" timestamp with time zone, "purge_after" timestamp with time zone, "source_path" "text"[], "tree" "jsonb", "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select *
  from private.list_trash_items_page(
    page_cursor_deleted_at,
    page_cursor_id,
    requested_page_size
  );
$$;


ALTER FUNCTION "public"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.record_fsrs_review(
    target_session_item_id, review_rating, review_time, selected_option,
    duration_seconds, expected_version, used_parameters_version);
$$;


ALTER FUNCTION "public"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.restore_trash_node(
    target_trash_id,
    target_node_type,
    target_node_id
  );
$$;


ALTER FUNCTION "public"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_ai_summary_note"("target_module_id" "uuid", "topic_title" "text", "topic_content" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."save_ai_summary_note"("target_module_id" "uuid", "topic_title" "text", "topic_content" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_exam_plan"("plan_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  saved_id uuid := nullif(plan_payload->>'id', '')::uuid;
  expected_version integer := nullif(plan_payload->>'expectedPlanVersion', '')::integer;
  rebuilt_on date := nullif(plan_payload->>'rebuiltOn', '')::date;
begin
  if owner_id is null then
    raise exception 'Musisz być zalogowany.';
  end if;

  if saved_id is null then
    saved_id := gen_random_uuid();
    insert into public.exam_plans (
      id, user_id, module_id, name, exam_date, target_retention,
      study_weekdays, daily_time_limit_minutes, daily_question_limit,
      buffer_percent, include_unassigned_questions, last_rebuilt_on
    ) values (
      saved_id,
      owner_id,
      (plan_payload->>'moduleId')::uuid,
      btrim(plan_payload->>'name'),
      (plan_payload->>'examDate')::date,
      (plan_payload->>'targetRetention')::numeric,
      array(
        select value::smallint
        from jsonb_array_elements_text(plan_payload->'studyWeekdays') as value
      ),
      nullif(plan_payload->>'dailyTimeLimitMinutes', '')::integer,
      nullif(plan_payload->>'dailyQuestionLimit', '')::integer,
      (plan_payload->>'bufferPercent')::smallint,
      coalesce((plan_payload->>'includeUnassignedQuestions')::boolean, false),
      rebuilt_on
    );
  else
    if expected_version is null then
      raise exception using
        errcode = '22023',
        message = 'Brakuje wersji planu wymaganej do bezpiecznego zapisu.';
    end if;

    update public.exam_plans
    set name = btrim(plan_payload->>'name'),
      exam_date = (plan_payload->>'examDate')::date,
      target_retention = (plan_payload->>'targetRetention')::numeric,
      study_weekdays = array(
        select value::smallint
        from jsonb_array_elements_text(plan_payload->'studyWeekdays') as value
      ),
      daily_time_limit_minutes = nullif(plan_payload->>'dailyTimeLimitMinutes', '')::integer,
      daily_question_limit = nullif(plan_payload->>'dailyQuestionLimit', '')::integer,
      buffer_percent = (plan_payload->>'bufferPercent')::smallint,
      include_unassigned_questions = coalesce(
        (plan_payload->>'includeUnassignedQuestions')::boolean,
        false
      ),
      needs_rebuild = case
        when rebuilt_on is not null then false
        else needs_rebuild
      end,
      last_rebuilt_on = coalesce(rebuilt_on, last_rebuilt_on),
      plan_version = plan_version + 1
    where id = saved_id
      and user_id = owner_id
      and plan_version = expected_version;

    if not found then
      if exists (
        select 1 from public.exam_plans
        where id = saved_id and user_id = owner_id
      ) then
        raise exception using
          errcode = '40001',
          message = 'Plan został zmieniony w innym miejscu. Odśwież widok i spróbuj ponownie.';
      end if;
      raise exception 'Nie znaleziono planu egzaminu.';
    end if;

    delete from public.exam_plan_topics
    where exam_plan_id = saved_id and user_id = owner_id;
    delete from public.exam_plan_assignments
    where exam_plan_id = saved_id and user_id = owner_id;
    delete from public.exam_plan_daily_targets
    where exam_plan_id = saved_id and user_id = owner_id;
  end if;

  insert into public.exam_plan_topics (
    exam_plan_id, user_id, topic_id, workload_points, workload_source
  )
  select saved_id, owner_id, source.id, source.workload_points, source.workload_source
  from jsonb_to_recordset(coalesce(plan_payload->'topicSettings', '[]'::jsonb))
    as source(id uuid, workload_points smallint, workload_source text);

  insert into public.exam_plan_assignments (
    exam_plan_id, user_id, topic_id, scheduled_for, position,
    workload_points, is_locked, completed_at
  )
  select saved_id, owner_id, source.topic_id, source.scheduled_for,
    source.position, source.workload_points, source.is_locked, source.completed_at
  from jsonb_to_recordset(coalesce(plan_payload->'assignments', '[]'::jsonb))
    as source(
      topic_id uuid,
      scheduled_for date,
      position integer,
      workload_points smallint,
      is_locked boolean,
      completed_at timestamptz
    );

  insert into public.exam_plan_daily_targets (
    exam_plan_id, user_id, target_date, topic_count, workload_points,
    review_target, review_forecast_low, review_forecast_high,
    is_buffer_day, is_overloaded
  )
  select saved_id, owner_id, source.target_date, source.topic_count,
    source.workload_points, source.review_target, source.review_forecast_low,
    source.review_forecast_high, source.is_buffer_day, source.is_overloaded
  from jsonb_to_recordset(coalesce(plan_payload->'days', '[]'::jsonb))
    as source(
      target_date date,
      topic_count integer,
      workload_points integer,
      review_target integer,
      review_forecast_low integer,
      review_forecast_high integer,
      is_buffer_day boolean,
      is_overloaded boolean
    );

  return saved_id;
end;
$$;


ALTER FUNCTION "public"."save_exam_plan"("plan_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_fsrs_profile"("requested_retention" double precision, "optimized_parameters" double precision[] DEFAULT NULL::double precision[]) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  next_version integer;
  lower_bounds constant double precision[] := array[
    0.001,0.001,0.001,0.001,1,0.001,0.001,0.001,0,0,0.001,
    0.001,0.001,0.001,0,0,1,0,0,0.01,0.1
  ];
  upper_bounds constant double precision[] := array[
    100,100,100,100,10,4,4,0.75,4.5,0.8,3.5,5,0.25,0.9,
    4,1,6,2,2,0.8,0.8
  ];
begin
  if requested_retention not between 0.7 and 0.99
    or (optimized_parameters is not null and (
      cardinality(optimized_parameters) <> 21
      or exists (
        select 1 from generate_subscripts(optimized_parameters, 1) index
        where optimized_parameters[index] is null
          or optimized_parameters[index] not between lower_bounds[index]
            and upper_bounds[index]
      )
    ))
  then raise exception 'Nieprawidłowe parametry profilu FSRS.'; end if;

  insert into public.fsrs_profiles (
    user_id, desired_retention, parameters, parameters_version,
    optimized_at, updated_at
  ) values (
    (select auth.uid()), requested_retention, optimized_parameters, 1,
    case when optimized_parameters is null then null else now() end, now()
  ) on conflict (user_id) do update set
    desired_retention = excluded.desired_retention,
    parameters = coalesce(excluded.parameters, public.fsrs_profiles.parameters),
    parameters_version = case
      when excluded.parameters is not null
        or excluded.desired_retention is distinct from public.fsrs_profiles.desired_retention
      then public.fsrs_profiles.parameters_version + 1
      else public.fsrs_profiles.parameters_version end,
    optimized_at = case when excluded.parameters is null
      then public.fsrs_profiles.optimized_at else now() end,
    updated_at = now()
  returning parameters_version into next_version;
  return next_version;
end;
$$;


ALTER FUNCTION "public"."save_fsrs_profile"("requested_retention" double precision, "optimized_parameters" double precision[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_id uuid := (select auth.uid());
  saved_id uuid := coalesce(question_id, gen_random_uuid());
  option_count integer;
  correct_count integer;
  candidate_dedupe_key text;
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
    raise exception 'Nie znaleziono modułu.';
  end if;
  if pg_catalog.jsonb_typeof(options) is distinct from 'array' then
    raise exception 'Pytanie wymaga prawidłowej listy odpowiedzi.';
  end if;

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where coalesce((item ->> 'isCorrect')::boolean, false)
    )
  into option_count, correct_count
  from pg_catalog.jsonb_array_elements(options) as item;

  if pg_catalog.btrim(question_content) = ''
    or option_count < 1
    or correct_count <> 1
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(options) as item
      where pg_catalog.btrim(item ->> 'content') = ''
    )
  then
    raise exception 'Pytanie wymaga treści i dokładnie jednej poprawnej odpowiedzi.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(options) as item
    group by private.normalize_question_duplicate_text(item ->> 'content')
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Odpowiedzi nie mogą się powtarzać.';
  end if;

  if selected_topic_id is not null then
    select topic.chapter_id
    into selected_chapter_id
    from public.topics as topic
    join public.chapters as chapter on chapter.id = topic.chapter_id
    where topic.id = selected_topic_id
      and topic.user_id = owner_id
      and topic.trash_id is null
      and chapter.module_id = target_module_id
      and chapter.trash_id is null;
    if selected_chapter_id is null then
      raise exception 'Nie znaleziono tematu w module.';
    end if;
  elsif selected_chapter_id is not null and not exists (
    select 1
    from public.chapters
    where id = selected_chapter_id
      and user_id = owner_id
      and module_id = target_module_id
      and trash_id is null
  ) then
    raise exception 'Nie znaleziono rozdziału w module.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || target_module_id::text, 0)
  );
  candidate_dedupe_key := private.question_dedupe_key(question_content, options);

  insert into public.questions (
    id,
    user_id,
    module_id,
    chapter_id,
    topic_id,
    content,
    explanation,
    dedupe_key
  ) values (
    saved_id,
    owner_id,
    target_module_id,
    selected_chapter_id,
    selected_topic_id,
    pg_catalog.btrim(question_content),
    nullif(pg_catalog.btrim(question_explanation), ''),
    candidate_dedupe_key
  )
  on conflict (id) do update set
    module_id = excluded.module_id,
    chapter_id = excluded.chapter_id,
    topic_id = excluded.topic_id,
    content = excluded.content,
    explanation = excluded.explanation,
    dedupe_key = excluded.dedupe_key,
    updated_at = pg_catalog.now()
  where questions.user_id = owner_id
    and questions.module_id = target_module_id
    and questions.trash_id is null;

  if not found then
    raise exception 'Nie znaleziono pytania.';
  end if;

  delete from public.question_options
  where question_options.question_id = saved_id
    and user_id = owner_id;

  insert into public.question_options (
    user_id,
    question_id,
    content,
    is_correct,
    position
  )
  select
    owner_id,
    saved_id,
    pg_catalog.btrim(item ->> 'content'),
    (item ->> 'isCorrect')::boolean,
    ordinality::integer
  from pg_catalog.jsonb_array_elements(options)
    with ordinality as source(item, ordinality);

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


CREATE TABLE IF NOT EXISTS "public"."ai_question_generation_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "source_hash" "text" NOT NULL,
    "question_count" smallint NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" integer NOT NULL,
    "proposals" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_question_generation_cache_model_check" CHECK ((("length"("btrim"("model")) >= 1) AND ("length"("btrim"("model")) <= 100))),
    CONSTRAINT "ai_question_generation_cache_prompt_version_check" CHECK (("prompt_version" > 0)),
    CONSTRAINT "ai_question_generation_cache_proposals_check" CHECK (("jsonb_typeof"("proposals") = 'array'::"text")),
    CONSTRAINT "ai_question_generation_cache_question_count_check" CHECK ((("question_count" >= 1) AND ("question_count" <= 10))),
    CONSTRAINT "ai_question_generation_cache_source_hash_check" CHECK (("source_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."ai_question_generation_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_summary_generation_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "scope_hash" "text" NOT NULL,
    "source_hash" "text" NOT NULL,
    "summary_length" "text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" integer NOT NULL,
    "summary" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_summary_generation_cache_length_check" CHECK (("summary_length" = ANY (ARRAY['short'::"text", 'standard'::"text", 'detailed'::"text"]))),
    CONSTRAINT "ai_summary_generation_cache_model_check" CHECK ((("length"("btrim"("model")) >= 1) AND ("length"("btrim"("model")) <= 100))),
    CONSTRAINT "ai_summary_generation_cache_prompt_version_check" CHECK (("prompt_version" > 0)),
    CONSTRAINT "ai_summary_generation_cache_scope_hash_check" CHECK (("scope_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "ai_summary_generation_cache_source_hash_check" CHECK (("source_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "ai_summary_generation_cache_summary_check" CHECK (("jsonb_typeof"("summary") = 'object'::"text"))
);


ALTER TABLE "public"."ai_summary_generation_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chapters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "module_id" "uuid" NOT NULL,
    "trash_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chapters_position_nonnegative" CHECK (("position" >= 0)),
    CONSTRAINT "chapters_slug_not_blank" CHECK (("btrim"("slug") <> ''::"text")),
    CONSTRAINT "chapters_title_not_blank" CHECK (("btrim"("title") <> ''::"text"))
);


ALTER TABLE "public"."chapters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_plan_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exam_plan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "scheduled_for" "date" NOT NULL,
    "position" integer NOT NULL,
    "workload_points" smallint NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_plan_assignments_position_check" CHECK (("position" > 0)),
    CONSTRAINT "exam_plan_assignments_workload_check" CHECK ((("workload_points" >= 1) AND ("workload_points" <= 6)))
);


ALTER TABLE "public"."exam_plan_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_plan_daily_targets" (
    "exam_plan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "target_date" "date" NOT NULL,
    "topic_count" integer DEFAULT 0 NOT NULL,
    "workload_points" integer DEFAULT 0 NOT NULL,
    "review_target" integer DEFAULT 0 NOT NULL,
    "review_forecast_low" integer DEFAULT 0 NOT NULL,
    "review_forecast_high" integer DEFAULT 0 NOT NULL,
    "is_buffer_day" boolean DEFAULT false NOT NULL,
    "is_overloaded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_plan_daily_targets_counts_check" CHECK ((("topic_count" >= 0) AND ("workload_points" >= 0) AND ("review_target" >= 0) AND ("review_forecast_low" >= 0) AND ("review_forecast_high" >= "review_forecast_low")))
);


ALTER TABLE "public"."exam_plan_daily_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_plan_topics" (
    "exam_plan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "workload_points" smallint DEFAULT 2 NOT NULL,
    "workload_source" "text" DEFAULT 'automatic'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_plan_topics_source_check" CHECK (("workload_source" = ANY (ARRAY['automatic'::"text", 'manual'::"text"]))),
    CONSTRAINT "exam_plan_topics_workload_check" CHECK ((("workload_points" >= 1) AND ("workload_points" <= 6)))
);


ALTER TABLE "public"."exam_plan_topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."exam_plan_topics" IS 'Resolved topic scope for an exam. Chapter and module selections are expanded to topics when saved.';



CREATE TABLE IF NOT EXISTS "public"."exam_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "exam_date" "date" NOT NULL,
    "target_retention" numeric(4,3) DEFAULT 0.900 NOT NULL,
    "study_weekdays" smallint[] DEFAULT ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint] NOT NULL,
    "daily_time_limit_minutes" integer,
    "daily_question_limit" integer,
    "buffer_percent" smallint DEFAULT 10 NOT NULL,
    "include_unassigned_questions" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "needs_rebuild" boolean DEFAULT false NOT NULL,
    "plan_version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_rebuilt_on" "date",
    CONSTRAINT "exam_plans_buffer_check" CHECK ((("buffer_percent" >= 0) AND ("buffer_percent" <= 30))),
    CONSTRAINT "exam_plans_name_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "exam_plans_question_limit_check" CHECK ((("daily_question_limit" IS NULL) OR (("daily_question_limit" >= 1) AND ("daily_question_limit" <= 1000)))),
    CONSTRAINT "exam_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "exam_plans_study_weekdays_check" CHECK ((("cardinality"("study_weekdays") BETWEEN 1 AND 7) AND ("study_weekdays" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))),
    CONSTRAINT "exam_plans_target_retention_check" CHECK ((("target_retention" >= 0.700) AND ("target_retention" <= 0.990))),
    CONSTRAINT "exam_plans_time_limit_check" CHECK ((("daily_time_limit_minutes" IS NULL) OR (("daily_time_limit_minutes" >= 5) AND ("daily_time_limit_minutes" <= 1440))))
);


ALTER TABLE "public"."exam_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."exam_plans" IS 'Independent exam deadlines and planning preferences. A module may have many overlapping plans.';



CREATE TABLE IF NOT EXISTS "public"."fsrs_profiles" (
    "user_id" "uuid" NOT NULL,
    "desired_retention" double precision DEFAULT 0.9 NOT NULL,
    "parameters" double precision[],
    "parameters_version" integer DEFAULT 1 NOT NULL,
    "optimized_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fsrs_profiles_parameters_check" CHECK ((("parameters" IS NULL) OR (("cardinality"("parameters") = 21) AND ("array_position"("parameters", NULL::double precision) IS NULL) AND (("parameters"[1] >= (0.001)::double precision) AND ("parameters"[1] <= (100)::double precision)) AND (("parameters"[2] >= (0.001)::double precision) AND ("parameters"[2] <= (100)::double precision)) AND (("parameters"[3] >= (0.001)::double precision) AND ("parameters"[3] <= (100)::double precision)) AND (("parameters"[4] >= (0.001)::double precision) AND ("parameters"[4] <= (100)::double precision)) AND (("parameters"[5] >= (1)::double precision) AND ("parameters"[5] <= (10)::double precision)) AND (("parameters"[6] >= (0.001)::double precision) AND ("parameters"[6] <= (4)::double precision)) AND (("parameters"[7] >= (0.001)::double precision) AND ("parameters"[7] <= (4)::double precision)) AND (("parameters"[8] >= (0.001)::double precision) AND ("parameters"[8] <= (0.75)::double precision)) AND (("parameters"[9] >= (0)::double precision) AND ("parameters"[9] <= (4.5)::double precision)) AND (("parameters"[10] >= (0)::double precision) AND ("parameters"[10] <= (0.8)::double precision)) AND (("parameters"[11] >= (0.001)::double precision) AND ("parameters"[11] <= (3.5)::double precision)) AND (("parameters"[12] >= (0.001)::double precision) AND ("parameters"[12] <= (5)::double precision)) AND (("parameters"[13] >= (0.001)::double precision) AND ("parameters"[13] <= (0.25)::double precision)) AND (("parameters"[14] >= (0.001)::double precision) AND ("parameters"[14] <= (0.9)::double precision)) AND (("parameters"[15] >= (0)::double precision) AND ("parameters"[15] <= (4)::double precision)) AND (("parameters"[16] >= (0)::double precision) AND ("parameters"[16] <= (1)::double precision)) AND (("parameters"[17] >= (1)::double precision) AND ("parameters"[17] <= (6)::double precision)) AND (("parameters"[18] >= (0)::double precision) AND ("parameters"[18] <= (2)::double precision)) AND (("parameters"[19] >= (0)::double precision) AND ("parameters"[19] <= (2)::double precision)) AND (("parameters"[20] >= (0.01)::double precision) AND ("parameters"[20] <= (0.8)::double precision)) AND (("parameters"[21] >= (0.1)::double precision) AND ("parameters"[21] <= (0.8)::double precision))))),
    CONSTRAINT "fsrs_profiles_retention_check" CHECK ((("desired_retention" >= (0.7)::double precision) AND ("desired_retention" <= (0.99)::double precision)))
);


ALTER TABLE "public"."fsrs_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."fsrs_profiles" IS 'Per-user FSRS v6 retention and optional optimizer-generated weights.';



CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trash_id" "uuid",
    "slug" "text" DEFAULT ''::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "exam_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "modules_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 120))),
    CONSTRAINT "modules_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."modules"."exam_date" IS 'Optional date of the exam associated with this module.';



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


CREATE TABLE IF NOT EXISTS "public"."question_review_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "session_item_id" "uuid",
    "reviewed_at" timestamp with time zone NOT NULL,
    "rating" smallint NOT NULL,
    "duration_seconds" integer DEFAULT 0 NOT NULL,
    "state_before" "text" NOT NULL,
    "state_after" "text" NOT NULL,
    "due_before" timestamp with time zone NOT NULL,
    "due_after" timestamp with time zone NOT NULL,
    "stability_before" double precision NOT NULL,
    "stability_after" double precision NOT NULL,
    "difficulty_before" double precision NOT NULL,
    "difficulty_after" double precision NOT NULL,
    "elapsed_days" integer NOT NULL,
    "scheduled_days" integer NOT NULL,
    "algorithm_version" "text" DEFAULT 'FSRS-6'::"text" NOT NULL,
    "parameters_version" integer NOT NULL,
    CONSTRAINT "question_review_logs_duration_check" CHECK ((("duration_seconds" >= 0) AND ("duration_seconds" <= 86400))),
    CONSTRAINT "question_review_logs_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 4))),
    CONSTRAINT "question_review_logs_state_after_check" CHECK (("state_after" = ANY (ARRAY['new'::"text", 'learning'::"text", 'review'::"text", 'relearning'::"text"]))),
    CONSTRAINT "question_review_logs_state_before_check" CHECK (("state_before" = ANY (ARRAY['new'::"text", 'learning'::"text", 'review'::"text", 'relearning'::"text"])))
);


ALTER TABLE "public"."question_review_logs" OWNER TO "postgres";


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
    "dedupe_key" "text",
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


COMMENT ON COLUMN "public"."study_goals"."weekly_topics_enabled" IS 'Whether the weekly completed-topics goal is enabled.';



COMMENT ON COLUMN "public"."study_goals"."review_reminders_enabled" IS 'Whether in-app question review reminders are enabled.';



COMMENT ON COLUMN "public"."study_goals"."review_reminder_interval_days" IS 'Number of days between in-app question review reminders.';



COMMENT ON COLUMN "public"."study_goals"."last_review_reminder_at" IS 'When the most recent in-app question review reminder was displayed.';



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


CREATE TABLE IF NOT EXISTS "public"."study_task_deferrals" (
    "user_id" "uuid" NOT NULL,
    "task_type" "text" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "deferred_until" "date" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "study_task_deferrals_task_type_check" CHECK (("task_type" = ANY (ARRAY['question'::"text", 'topic'::"text"])))
);


ALTER TABLE "public"."study_task_deferrals" OWNER TO "postgres";


COMMENT ON TABLE "public"."study_task_deferrals" IS 'Per-user deferrals for automatically generated Today tasks.';



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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topic_images_bytes_check" CHECK (("bytes" > 0)),
    CONSTRAINT "topic_images_format_check" CHECK (("format" = 'webp'::"text")),
    CONSTRAINT "topic_images_height_check" CHECK (("height" > 0)),
    CONSTRAINT "topic_images_width_check" CHECK (("width" > 0))
);


ALTER TABLE "public"."topic_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "chapter_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{"type": "doc", "content": [{"type": "paragraph"}]}'::"jsonb" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "position" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trash_id" "uuid",
    "first_completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topics_content_is_object" CHECK (("jsonb_typeof"("content") = 'object'::"text")),
    CONSTRAINT "topics_position_nonnegative" CHECK (("position" >= 0)),
    CONSTRAINT "topics_slug_not_blank" CHECK (("btrim"("slug") <> ''::"text")),
    CONSTRAINT "topics_title_not_blank" CHECK (("btrim"("title") <> ''::"text"))
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


ALTER TABLE ONLY "public"."ai_question_generation_cache"
    ADD CONSTRAINT "ai_question_generation_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_question_generation_cache"
    ADD CONSTRAINT "ai_question_generation_cache_user_topic_key" UNIQUE ("user_id", "topic_id");



ALTER TABLE ONLY "public"."ai_summary_generation_cache"
    ADD CONSTRAINT "ai_summary_generation_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_summary_generation_cache"
    ADD CONSTRAINT "ai_summary_generation_cache_scope_key" UNIQUE ("user_id", "module_id", "scope_hash", "summary_length");



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_id_users_id_unique" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exam_plan_assignments"
    ADD CONSTRAINT "exam_plan_assignments_exam_plan_id_scheduled_for_position_key" UNIQUE ("exam_plan_id", "scheduled_for", "position");



ALTER TABLE ONLY "public"."exam_plan_assignments"
    ADD CONSTRAINT "exam_plan_assignments_exam_plan_id_topic_id_key" UNIQUE ("exam_plan_id", "topic_id");



ALTER TABLE ONLY "public"."exam_plan_assignments"
    ADD CONSTRAINT "exam_plan_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exam_plan_daily_targets"
    ADD CONSTRAINT "exam_plan_daily_targets_pkey" PRIMARY KEY ("exam_plan_id", "target_date");



ALTER TABLE ONLY "public"."exam_plan_topics"
    ADD CONSTRAINT "exam_plan_topics_pkey" PRIMARY KEY ("exam_plan_id", "topic_id");



ALTER TABLE ONLY "public"."exam_plans"
    ADD CONSTRAINT "exam_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fsrs_profiles"
    ADD CONSTRAINT "fsrs_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_id_user_id_key" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_position_key" UNIQUE ("question_id", "position");



ALTER TABLE ONLY "public"."question_review_logs"
    ADD CONSTRAINT "question_review_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_review_states"
    ADD CONSTRAINT "question_review_states_pkey" PRIMARY KEY ("user_id", "question_id");



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



ALTER TABLE ONLY "public"."study_task_deferrals"
    ADD CONSTRAINT "study_task_deferrals_pkey" PRIMARY KEY ("user_id", "task_type", "task_id");



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_storage_key_key" UNIQUE ("storage_key");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trash_items"
    ADD CONSTRAINT "trash_items_item_type_item_id_key" UNIQUE ("item_type", "item_id");



ALTER TABLE ONLY "public"."trash_items"
    ADD CONSTRAINT "trash_items_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_question_generation_cache_module_owner_idx" ON "public"."ai_question_generation_cache" USING "btree" ("module_id", "user_id");



CREATE INDEX "ai_question_generation_cache_topic_owner_idx" ON "public"."ai_question_generation_cache" USING "btree" ("topic_id", "user_id");



CREATE INDEX "ai_summary_generation_cache_module_owner_idx" ON "public"."ai_summary_generation_cache" USING "btree" ("module_id", "user_id");



CREATE INDEX "chapters_active_idx" ON "public"."chapters" USING "btree" ("module_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE UNIQUE INDEX "chapters_module_slug_idx" ON "public"."chapters" USING "btree" ("module_id", "slug") WHERE ("trash_id" IS NULL);



CREATE UNIQUE INDEX "chapters_module_title_unique_idx" ON "public"."chapters" USING "btree" ("module_id", "lower"("btrim"("title"))) WHERE ("trash_id" IS NULL);



CREATE INDEX "chapters_module_user_position_id_idx" ON "public"."chapters" USING "btree" ("module_id", "user_id", "position", "id");



CREATE INDEX "chapters_offline_sync_idx" ON "public"."chapters" USING "btree" ("module_id", "user_id", "updated_at", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "chapters_title_search_idx" ON "public"."chapters" USING "gin" ("lower"("title") "extensions"."gin_trgm_ops");



CREATE INDEX "chapters_title_trgm_idx" ON "public"."chapters" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "chapters_trash_id_idx" ON "public"."chapters" USING "btree" ("trash_id") WHERE ("trash_id" IS NOT NULL);



CREATE INDEX "chapters_user_position_id_idx" ON "public"."chapters" USING "btree" ("user_id", "position", "id");



CREATE INDEX "exam_plan_assignments_user_date_idx" ON "public"."exam_plan_assignments" USING "btree" ("user_id", "scheduled_for");



CREATE INDEX "exam_plan_daily_targets_user_date_idx" ON "public"."exam_plan_daily_targets" USING "btree" ("user_id", "target_date");



CREATE INDEX "exam_plan_topics_topic_idx" ON "public"."exam_plan_topics" USING "btree" ("topic_id", "exam_plan_id");



CREATE INDEX "exam_plans_module_exam_date_idx" ON "public"."exam_plans" USING "btree" ("module_id", "exam_date") WHERE ("status" = 'active'::"text");



CREATE INDEX "exam_plans_user_exam_date_idx" ON "public"."exam_plans" USING "btree" ("user_id", "exam_date") WHERE ("status" = 'active'::"text");



CREATE INDEX "modules_active_idx" ON "public"."modules" USING "btree" ("user_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "modules_trash_id_idx" ON "public"."modules" USING "btree" ("trash_id") WHERE ("trash_id" IS NOT NULL);



CREATE UNIQUE INDEX "modules_user_normalized_name_idx" ON "public"."modules" USING "btree" ("user_id", "lower"("btrim"("name"))) WHERE ("trash_id" IS NULL);



CREATE INDEX "modules_user_pinned_name_idx" ON "public"."modules" USING "btree" ("user_id", "is_pinned" DESC, "lower"("name"), "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "modules_user_position_id_idx" ON "public"."modules" USING "btree" ("user_id", "position", "id");



CREATE UNIQUE INDEX "modules_user_slug_idx" ON "public"."modules" USING "btree" ("user_id", "slug") WHERE ("trash_id" IS NULL);



CREATE INDEX "question_options_user_question_position_idx" ON "public"."question_options" USING "btree" ("user_id", "question_id", "position");



CREATE INDEX "question_review_logs_question_reviewed_idx" ON "public"."question_review_logs" USING "btree" ("user_id", "question_id", "reviewed_at");



CREATE INDEX "question_review_logs_user_reviewed_idx" ON "public"."question_review_logs" USING "btree" ("user_id", "reviewed_at", "id");



CREATE UNIQUE INDEX "question_review_logs_user_session_item_idx" ON "public"."question_review_logs" USING "btree" ("user_id", "session_item_id") WHERE ("session_item_id" IS NOT NULL);



CREATE INDEX "question_review_states_due_idx" ON "public"."question_review_states" USING "btree" ("user_id", "due_at", "question_id");



CREATE UNIQUE INDEX "questions_active_dedupe_idx" ON "public"."questions" USING "btree" ("user_id", "module_id", "dedupe_key") WHERE (("trash_id" IS NULL) AND ("dedupe_key" IS NOT NULL));



CREATE INDEX "questions_active_idx" ON "public"."questions" USING "btree" ("module_id", "created_at" DESC) WHERE ("trash_id" IS NULL);



CREATE INDEX "questions_trash_id_idx" ON "public"."questions" USING "btree" ("trash_id") WHERE ("trash_id" IS NOT NULL);



CREATE INDEX "questions_user_chapter_topic_idx" ON "public"."questions" USING "btree" ("user_id", "chapter_id", "topic_id");



CREATE INDEX "questions_user_created_idx" ON "public"."questions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "questions_user_module_created_idx" ON "public"."questions" USING "btree" ("user_id", "module_id", "created_at" DESC);



CREATE INDEX "study_session_items_session_answered_idx" ON "public"."study_session_items" USING "btree" ("session_id", "answered_at") WHERE ("answered_at" IS NOT NULL);



CREATE INDEX "study_session_items_user_answered_idx" ON "public"."study_session_items" USING "btree" ("user_id", "answered_at") WHERE ("answered_at" IS NOT NULL);



CREATE INDEX "study_session_items_user_session_position_idx" ON "public"."study_session_items" USING "btree" ("user_id", "session_id", "position");



CREATE INDEX "study_sessions_active_idx" ON "public"."study_sessions" USING "btree" ("module_id", "started_at" DESC) WHERE ("trash_id" IS NULL);



CREATE INDEX "study_sessions_trash_id_idx" ON "public"."study_sessions" USING "btree" ("trash_id") WHERE ("trash_id" IS NOT NULL);



CREATE INDEX "study_sessions_user_module_started_idx" ON "public"."study_sessions" USING "btree" ("user_id", "module_id", "started_at" DESC);



CREATE INDEX "study_sessions_user_started_idx" ON "public"."study_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "topic_images_active_idx" ON "public"."topic_images" USING "btree" ("topic_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "topic_images_offline_sync_idx" ON "public"."topic_images" USING "btree" ("topic_id", "user_id", "updated_at", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "topic_images_topic_user_position_id_idx" ON "public"."topic_images" USING "btree" ("topic_id", "user_id", "position", "id");



CREATE INDEX "topic_images_trash_id_idx" ON "public"."topic_images" USING "btree" ("trash_id") WHERE ("trash_id" IS NOT NULL);



CREATE INDEX "topic_images_user_id_idx" ON "public"."topic_images" USING "btree" ("user_id");



CREATE INDEX "topics_active_idx" ON "public"."topics" USING "btree" ("chapter_id", "position", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "topics_chapter_id_idx" ON "public"."topics" USING "btree" ("chapter_id");



CREATE UNIQUE INDEX "topics_chapter_slug_idx" ON "public"."topics" USING "btree" ("chapter_id", "slug") WHERE ("trash_id" IS NULL);



CREATE UNIQUE INDEX "topics_chapter_title_unique_idx" ON "public"."topics" USING "btree" ("chapter_id", "lower"("btrim"("title"))) WHERE ("trash_id" IS NULL);



CREATE INDEX "topics_first_completion_idx" ON "public"."topics" USING "btree" ("user_id", "first_completed_at") WHERE (("trash_id" IS NULL) AND ("first_completed_at" IS NOT NULL));



CREATE UNIQUE INDEX "topics_id_user_id_unique" ON "public"."topics" USING "btree" ("id", "user_id");



CREATE INDEX "topics_offline_sync_idx" ON "public"."topics" USING "btree" ("chapter_id", "user_id", "updated_at", "id") WHERE ("trash_id" IS NULL);



CREATE INDEX "topics_title_search_idx" ON "public"."topics" USING "gin" ("lower"("title") "extensions"."gin_trgm_ops");



CREATE INDEX "topics_title_trgm_idx" ON "public"."topics" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "topics_trash_id_idx" ON "public"."topics" USING "btree" ("trash_id") WHERE ("trash_id" IS NOT NULL);



CREATE INDEX "topics_user_chapter_position_id_idx" ON "public"."topics" USING "btree" ("user_id", "chapter_id", "position", "id");



CREATE INDEX "trash_items_purge_after_idx" ON "public"."trash_items" USING "btree" ("purge_after");



CREATE INDEX "trash_items_user_deleted_id_idx" ON "public"."trash_items" USING "btree" ("user_id", "deleted_at" DESC, "id" DESC);



CREATE OR REPLACE TRIGGER "mark_exam_plans_dirty_on_question_change" AFTER INSERT OR DELETE OR UPDATE OF "module_id", "topic_id", "trash_id" ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "private"."mark_exam_plans_dirty_on_question_change"();



CREATE OR REPLACE TRIGGER "mark_exam_plans_dirty_on_review_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."question_review_states" FOR EACH ROW EXECUTE FUNCTION "private"."mark_exam_plans_dirty_on_review_change"();



CREATE OR REPLACE TRIGGER "mark_exam_plans_dirty_on_topic_change" AFTER UPDATE OF "completed" ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "private"."mark_exam_plans_dirty_on_topic_change"();



CREATE CONSTRAINT TRIGGER "refresh_question_dedupe_key_after_option_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."question_options" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "private"."refresh_question_dedupe_key_trigger"();



CREATE CONSTRAINT TRIGGER "refresh_question_dedupe_key_after_question_change" AFTER INSERT OR UPDATE OF "content", "module_id", "trash_id", "dedupe_key" ON "public"."questions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "private"."refresh_question_row_dedupe_key_trigger"();



CREATE OR REPLACE TRIGGER "set_chapters_updated_at" BEFORE UPDATE ON "public"."chapters" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_module_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."modules" FOR EACH ROW EXECUTE FUNCTION "public"."set_module_slug"();



CREATE OR REPLACE TRIGGER "set_modules_updated_at" BEFORE UPDATE ON "public"."modules" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_topic_images_updated_at" BEFORE UPDATE ON "public"."topic_images" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_topics_updated_at" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_chapter_questions_module" AFTER UPDATE OF "module_id" ON "public"."chapters" FOR EACH ROW EXECUTE FUNCTION "public"."sync_chapter_questions_module"();



CREATE OR REPLACE TRIGGER "sync_module_exam_date_from_plans" AFTER INSERT OR DELETE OR UPDATE OF "module_id", "user_id", "exam_date", "status" ON "public"."exam_plans" FOR EACH ROW EXECUTE FUNCTION "private"."sync_module_exam_date_from_plans"();



CREATE OR REPLACE TRIGGER "sync_topic_first_completed_at" BEFORE INSERT OR UPDATE OF "completed", "first_completed_at" ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "public"."sync_topic_first_completed_at"();



CREATE OR REPLACE TRIGGER "validate_exam_plan" BEFORE INSERT OR UPDATE ON "public"."exam_plans" FOR EACH ROW EXECUTE FUNCTION "private"."validate_exam_plan"();



CREATE OR REPLACE TRIGGER "validate_exam_plan_assignment" BEFORE INSERT OR UPDATE ON "public"."exam_plan_assignments" FOR EACH ROW EXECUTE FUNCTION "private"."validate_exam_plan_child"();



CREATE OR REPLACE TRIGGER "validate_exam_plan_daily_target" BEFORE INSERT OR UPDATE ON "public"."exam_plan_daily_targets" FOR EACH ROW EXECUTE FUNCTION "private"."validate_exam_plan_child"();



CREATE OR REPLACE TRIGGER "validate_exam_plan_topic" BEFORE INSERT OR UPDATE ON "public"."exam_plan_topics" FOR EACH ROW EXECUTE FUNCTION "private"."validate_exam_plan_child"();



ALTER TABLE ONLY "public"."ai_question_generation_cache"
    ADD CONSTRAINT "ai_question_generation_cache_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_question_generation_cache"
    ADD CONSTRAINT "ai_question_generation_cache_topic_owner_fkey" FOREIGN KEY ("topic_id", "user_id") REFERENCES "public"."topics"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_question_generation_cache"
    ADD CONSTRAINT "ai_question_generation_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_summary_generation_cache"
    ADD CONSTRAINT "ai_summary_generation_cache_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_summary_generation_cache"
    ADD CONSTRAINT "ai_summary_generation_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_module_owner_fkey" FOREIGN KEY ("module_id", "user_id") REFERENCES "public"."modules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chapters"
    ADD CONSTRAINT "chapters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_assignments"
    ADD CONSTRAINT "exam_plan_assignments_exam_plan_id_fkey" FOREIGN KEY ("exam_plan_id") REFERENCES "public"."exam_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_assignments"
    ADD CONSTRAINT "exam_plan_assignments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_assignments"
    ADD CONSTRAINT "exam_plan_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_daily_targets"
    ADD CONSTRAINT "exam_plan_daily_targets_exam_plan_id_fkey" FOREIGN KEY ("exam_plan_id") REFERENCES "public"."exam_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_daily_targets"
    ADD CONSTRAINT "exam_plan_daily_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_topics"
    ADD CONSTRAINT "exam_plan_topics_exam_plan_id_fkey" FOREIGN KEY ("exam_plan_id") REFERENCES "public"."exam_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_topics"
    ADD CONSTRAINT "exam_plan_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plan_topics"
    ADD CONSTRAINT "exam_plan_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plans"
    ADD CONSTRAINT "exam_plans_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_plans"
    ADD CONSTRAINT "exam_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fsrs_profiles"
    ADD CONSTRAINT "fsrs_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_review_logs"
    ADD CONSTRAINT "question_review_logs_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_review_logs"
    ADD CONSTRAINT "question_review_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."question_review_logs"
    ADD CONSTRAINT "question_review_logs_session_item_id_fkey" FOREIGN KEY ("session_item_id") REFERENCES "public"."study_session_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."question_review_logs"
    ADD CONSTRAINT "question_review_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_review_states"
    ADD CONSTRAINT "question_review_states_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_review_states"
    ADD CONSTRAINT "question_review_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."study_task_deferrals"
    ADD CONSTRAINT "study_task_deferrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_topic_owner_fkey" FOREIGN KEY ("topic_id", "user_id") REFERENCES "public"."topics"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_trash_id_fkey" FOREIGN KEY ("trash_id") REFERENCES "public"."trash_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."topic_images"
    ADD CONSTRAINT "topic_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



CREATE POLICY "Users can create own topics" ON "public"."topics" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own chapters" ON "public"."chapters" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own topic images" ON "public"."topic_images" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own topics" ON "public"."topics" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own topic images" ON "public"."topic_images" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own chapters" ON "public"."chapters" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own topic images" ON "public"."topic_images" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own topics" ON "public"."topics" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own chapters" ON "public"."chapters" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own topic images" ON "public"."topic_images" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own topics" ON "public"."topics" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users create own study goal" ON "public"."study_goals" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users create own task deferrals" ON "public"."study_task_deferrals" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own AI question cache" ON "public"."ai_question_generation_cache" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own AI summary cache" ON "public"."ai_summary_generation_cache" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own modules" ON "public"."modules" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own task deferrals" ON "public"."study_task_deferrals" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Users delete own trash" ON "public"."trash_items" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own AI question cache" ON "public"."ai_question_generation_cache" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own AI summary cache" ON "public"."ai_summary_generation_cache" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own modules" ON "public"."modules" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own FSRS profile" ON "public"."fsrs_profiles" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own exam plan assignments" ON "public"."exam_plan_assignments" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own exam plan daily targets" ON "public"."exam_plan_daily_targets" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own exam plan topics" ON "public"."exam_plan_topics" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own exam plans" ON "public"."exam_plans" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



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



CREATE POLICY "Users read own review logs" ON "public"."question_review_logs" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read own review states" ON "public"."question_review_states" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read own study goal" ON "public"."study_goals" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Users read own task deferrals" ON "public"."study_task_deferrals" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Users read own trash" ON "public"."trash_items" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users select own AI question cache" ON "public"."ai_question_generation_cache" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users select own AI summary cache" ON "public"."ai_summary_generation_cache" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users select own modules" ON "public"."modules" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own AI question cache" ON "public"."ai_question_generation_cache" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own AI summary cache" ON "public"."ai_summary_generation_cache" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own modules" ON "public"."modules" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own study goal" ON "public"."study_goals" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own task deferrals" ON "public"."study_task_deferrals" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."ai_question_generation_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_summary_generation_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chapters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_plan_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_plan_daily_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_plan_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fsrs_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_review_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_review_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_session_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_task_deferrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trash_items" ENABLE ROW LEVEL SECURITY;




GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



















































































































































































































































-- Hosted Supabase may grant EXECUTE to API roles through default privileges.
-- Remove inherited access first; the explicit grants below form the RPC
-- allowlist for authenticated users.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA "public"
    FROM PUBLIC, "anon", "authenticated";



REVOKE ALL ON FUNCTION "private"."build_trash_tree"("target_trash_id" "uuid", "target_type" "text", "target_item_id" "uuid", "target_title" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."calculate_fsrs_v6_transition"("current_state" "public"."question_review_states", "review_rating" smallint, "review_time" timestamp with time zone, "desired_retention" double precision, "parameters" double precision[]) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."fsrs_round8"("value" double precision) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_trash_image_keys"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."mark_exam_plans_dirty_for_question"("owner_id" "uuid", "target_module_id" "uuid", "target_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."mark_exam_plans_dirty_for_question"("owner_id" "uuid", "target_module_id" "uuid", "target_topic_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."mark_exam_plans_dirty_on_question_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."mark_exam_plans_dirty_on_review_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."mark_exam_plans_dirty_on_topic_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."normalize_question_duplicate_text"("value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."normalize_question_duplicate_text"("value" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."purge_trash_item"("target_trash_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."question_dedupe_key"("question_content" "text", "options" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."question_dedupe_key"("question_content" "text", "options" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."refresh_question_dedupe_key"("target_question_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_question_dedupe_key_trigger"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_question_row_dedupe_key_trigger"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."restore_trash_item"("target_trash_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."rls_auto_enable"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_module_exam_date_from_plans"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."validate_exam_plan"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."validate_exam_plan_child"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."approve_ai_generated_questions"("target_module_id" "uuid", "generated_questions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_ai_generated_questions"("target_module_id" "uuid", "generated_questions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_ai_generated_questions"("target_module_id" "uuid", "generated_questions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_assign_questions"("target_module_id" "uuid", "question_ids" "uuid"[], "selected_chapter_id" "uuid", "selected_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_assign_questions"("target_module_id" "uuid", "question_ids" "uuid"[], "selected_chapter_id" "uuid", "selected_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_assign_questions"("target_module_id" "uuid", "question_ids" "uuid"[], "selected_chapter_id" "uuid", "selected_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_chapter_with_topics"("target_module_id" "uuid", "new_chapter" "jsonb", "new_topics" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_chapter_with_topics"("target_module_id" "uuid", "new_chapter" "jsonb", "new_topics" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_chapter_with_topics"("target_module_id" "uuid", "new_chapter" "jsonb", "new_topics" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_fsrs_study_session"("target_module_id" "uuid", "requested_question_count" integer, "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_fsrs_study_session"("target_module_id" "uuid", "requested_question_count" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_fsrs_study_session"("target_module_id" "uuid", "requested_question_count" integer, "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer, "hide_flashcard_options" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer, "hide_flashcard_options" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_study_session"("target_module_id" "uuid", "study_mode" "text", "scope_mode" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "random_chapter_count" integer, "requested_question_count" integer, "hide_flashcard_options" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_empty_module"("target_module_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_module_cascade"("target_module_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_notes_bulk"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_ai_question_generation_topics"("target_module_id" "uuid", "selected_topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ai_question_generation_topics"("target_module_id" "uuid", "selected_topic_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ai_question_generation_topics"("target_module_id" "uuid", "selected_topic_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_chapter_gallery_images"("target_module_id" "uuid", "target_chapter_id" "uuid", "page_offset" integer, "page_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chapter_summaries"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_exam_planning_chapters"("target_module_id" "uuid", "search_query" "text", "after_position" bigint, "after_id" "uuid", "result_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_exam_planning_chapters"("target_module_id" "uuid", "search_query" "text", "after_position" bigint, "after_id" "uuid", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_planning_chapters"("target_module_id" "uuid", "search_query" "text", "after_position" bigint, "after_id" "uuid", "result_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_exam_planning_scope"("target_module_id" "uuid", "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_exam_planning_scope"("target_module_id" "uuid", "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_planning_scope"("target_module_id" "uuid", "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_exam_planning_topics"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "result_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_exam_planning_topics"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_planning_topics"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "result_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_exam_planning_topics_page"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "after_chapter_position" bigint, "after_topic_position" bigint, "after_id" "uuid", "result_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_exam_planning_topics_page"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "after_chapter_position" bigint, "after_topic_position" bigint, "after_id" "uuid", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_planning_topics_page"("target_module_id" "uuid", "target_chapter_ids" "uuid"[], "timezone_name" "text", "search_query" "text", "after_chapter_position" bigint, "after_topic_position" bigint, "after_id" "uuid", "result_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_learning_summary"("target_module_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_module_gallery_images"("target_module_id" "uuid", "sort_mode" "text", "page_offset" integer, "page_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_module_gallery_sections"("target_module_id" "uuid", "sort_mode" "text", "per_chapter_limit" integer, "chapter_offset" integer, "chapter_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_module_image_keys"("target_module_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_module_summaries"("target_module_id" "uuid", "target_module_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_offline_module_changes"("target_module_id" "uuid", "changed_since" timestamp with time zone, "include_images" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_offline_module_changes"("target_module_id" "uuid", "changed_since" timestamp with time zone, "include_images" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_offline_module_changes"("target_module_id" "uuid", "changed_since" timestamp with time zone, "include_images" boolean) TO "service_role";



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
GRANT ALL ON FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_question_bank_availability"("target_module_id" "uuid", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "only_unassigned" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_question_duplicate_status"("target_module_id" "uuid", "excluded_question_id" "uuid", "question_content" "text", "options" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_question_duplicate_status"("target_module_id" "uuid", "excluded_question_id" "uuid", "question_content" "text", "options" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_question_duplicate_status"("target_module_id" "uuid", "excluded_question_id" "uuid", "question_content" "text", "options" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_study_assessment"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_study_assessment"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_study_assessment"("target_module_id" "uuid", "range_days" integer, "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_study_statistics"("target_module_id" "uuid", "range_days" integer, "study_mode" "text", "timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_today_dashboard"("timezone_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_today_dashboard"("timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_today_dashboard"("timezone_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_topic_navigation"("target_module_id" "uuid", "current_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_trash_image_keys"("target_trash_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."import_docx_into_module"("target_module_id" "uuid", "imported_chapters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_docx_into_module"("target_module_id" "uuid", "imported_chapters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_docx_into_module"("target_module_id" "uuid", "imported_chapters" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_docx_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_docx_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_docx_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_learning_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb", "imported_questions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_learning_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb", "imported_questions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_learning_module"("target_name" "text", "target_position" bigint, "imported_chapters" "jsonb", "imported_questions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_question_module"("target_name" "text", "target_position" bigint, "imported_questions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_question_module"("target_name" "text", "target_position" bigint, "imported_questions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_question_module"("target_name" "text", "target_position" bigint, "imported_questions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_questions_into_module"("target_module_id" "uuid", "imported_questions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_questions_into_module"("target_module_id" "uuid", "imported_questions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_questions_into_module"("target_module_id" "uuid", "imported_questions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_trash_items_page"("page_cursor_deleted_at" timestamp with time zone, "page_cursor_id" "uuid", "requested_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."move_notes_to_trash"("chapter_ids" "uuid"[], "topic_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."move_to_trash"("target_type" "text", "target_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."move_topic"("moved_topic_id" "uuid", "source_chapter_id" "uuid", "target_chapter_id" "uuid", "target_slug" "text", "source_topic_ids" "uuid"[], "target_topic_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."purge_trash_item"("target_trash_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_fsrs_review"("target_session_item_id" "uuid", "review_rating" smallint, "review_time" timestamp with time zone, "selected_option" "uuid", "duration_seconds" integer, "expected_version" integer, "used_parameters_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."reorder_chapters"("chapter_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."reorder_modules"("module_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."reorder_topic_images"("target_topic_id" "uuid", "image_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."reorder_topics"("target_chapter_id" "uuid", "topic_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."restore_trash_item"("target_trash_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_trash_node"("target_trash_id" "uuid", "target_node_type" "text", "target_node_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_ai_summary_note"("target_module_id" "uuid", "topic_title" "text", "topic_content" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_ai_summary_note"("target_module_id" "uuid", "topic_title" "text", "topic_content" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_ai_summary_note"("target_module_id" "uuid", "topic_title" "text", "topic_content" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_exam_plan"("plan_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_exam_plan"("plan_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_exam_plan"("plan_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_fsrs_profile"("requested_retention" double precision, "optimized_parameters" double precision[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_fsrs_profile"("requested_retention" double precision, "optimized_parameters" double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_fsrs_profile"("requested_retention" double precision, "optimized_parameters" double precision[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."save_question"("target_module_id" "uuid", "question_id" "uuid", "question_content" "text", "question_explanation" "text", "selected_chapter_id" "uuid", "selected_topic_id" "uuid", "options" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_topic_content"("target_chapter_id" "uuid", "target_topic_id" "uuid", "new_content" "jsonb", "expected_content" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_module_slug"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_module_slug"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_chapter_questions_module"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_chapter_questions_module"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_topic_first_completed_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_topic_first_completed_at"() TO "service_role";


















-- Supabase projects may grant privileges to API roles through platform-level
-- default privileges. Start from no direct table or sequence access, then add
-- only the application permissions captured below.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";



GRANT ALL ON TABLE "public"."ai_question_generation_cache" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ai_question_generation_cache" TO "authenticated";



GRANT ALL ON TABLE "public"."ai_summary_generation_cache" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ai_summary_generation_cache" TO "authenticated";



GRANT ALL ON TABLE "public"."chapters" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."chapters" TO "authenticated";



GRANT ALL ON TABLE "public"."exam_plan_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."exam_plan_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."exam_plan_daily_targets" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."exam_plan_daily_targets" TO "authenticated";



GRANT ALL ON TABLE "public"."exam_plan_topics" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."exam_plan_topics" TO "authenticated";



GRANT ALL ON TABLE "public"."exam_plans" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."exam_plans" TO "authenticated";



GRANT ALL ON TABLE "public"."fsrs_profiles" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."fsrs_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."modules" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."modules" TO "authenticated";



GRANT ALL ON TABLE "public"."question_options" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."question_options" TO "authenticated";



GRANT ALL ON TABLE "public"."question_review_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."question_review_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."question_review_states" TO "service_role";
GRANT SELECT ON TABLE "public"."question_review_states" TO "authenticated";



GRANT ALL ON TABLE "public"."questions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."questions" TO "authenticated";



GRANT ALL ON TABLE "public"."study_goals" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."study_goals" TO "authenticated";



GRANT ALL ON TABLE "public"."study_session_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."study_session_items" TO "authenticated";



GRANT ALL ON TABLE "public"."study_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."study_sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."study_task_deferrals" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."study_task_deferrals" TO "authenticated";



GRANT ALL ON TABLE "public"."topic_images" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."topic_images" TO "authenticated";



GRANT ALL ON TABLE "public"."topics" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."topics" TO "authenticated";



GRANT ALL ON TABLE "public"."trash_items" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."trash_items" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




































--
-- Dumped schema changes for auth and storage
--
