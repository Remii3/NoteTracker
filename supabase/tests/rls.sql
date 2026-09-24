-- Integration tests run against the freshly restored application schema.
-- Fixtures and all test changes are rolled back, including on Supabase.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end; $$;

insert into auth.users(id) values ('10000000-0000-4000-8000-000000000000');
insert into public.modules(id,user_id,name,position) values ('10000001-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','Module 1',1000);
insert into public.chapters(id,user_id,module_id,slug,title,position) values ('10000002-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000001-0000-4000-8000-000000000000','chapter','Chapter',1000);
insert into public.topics(id,user_id,chapter_id,slug,title,position) values ('10000003-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000002-0000-4000-8000-000000000000','topic','Topic',1000);
insert into public.questions(id,user_id,module_id,chapter_id,topic_id,content) values ('10000004-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000001-0000-4000-8000-000000000000','10000002-0000-4000-8000-000000000000','10000003-0000-4000-8000-000000000000','Question');
insert into public.question_options(id,user_id,question_id,content,is_correct,position) values ('10000005-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000004-0000-4000-8000-000000000000','Answer',true,1);
insert into public.study_sessions(id,user_id,module_id,mode) values ('10000006-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000001-0000-4000-8000-000000000000','flashcards');
insert into public.study_session_items(id,user_id,session_id,question_id,position,question_snapshot,options_snapshot)
 values ('10000007-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000006-0000-4000-8000-000000000000','10000004-0000-4000-8000-000000000000',1,'Question','[]');
insert into public.topic_images(id,user_id,topic_id,storage_key,original_filename,format,width,height,bytes,position)
 values ('10000009-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000003-0000-4000-8000-000000000000','1/image.webp','image.webp','webp',1,1,1,1000);
insert into public.trash_items(id,user_id,item_type,item_id,title) values ('10000008-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','topic','10000010-0000-4000-8000-000000000000','Deleted');
insert into public.study_goals(user_id,weekly_minutes) values ('10000000-0000-4000-8000-000000000000',180);
insert into public.study_task_deferrals(user_id,task_type,task_id,deferred_until)
 values ('10000000-0000-4000-8000-000000000000','topic','10000003-0000-4000-8000-000000000000',current_date);

insert into auth.users(id) values ('20000000-0000-4000-8000-000000000000');
insert into public.modules(id,user_id,name,position) values ('20000001-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','Module 2',1000);
insert into public.chapters(id,user_id,module_id,slug,title,position) values ('20000002-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000001-0000-4000-8000-000000000000','chapter','Chapter',1000);
insert into public.topics(id,user_id,chapter_id,slug,title,position) values ('20000003-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000002-0000-4000-8000-000000000000','topic','Topic',1000);
insert into public.questions(id,user_id,module_id,chapter_id,topic_id,content) values ('20000004-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000001-0000-4000-8000-000000000000','20000002-0000-4000-8000-000000000000','20000003-0000-4000-8000-000000000000','Question');
insert into public.question_options(id,user_id,question_id,content,is_correct,position) values ('20000005-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000004-0000-4000-8000-000000000000','Answer',true,1);
insert into public.study_sessions(id,user_id,module_id,mode) values ('20000006-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000001-0000-4000-8000-000000000000','flashcards');
insert into public.study_session_items(id,user_id,session_id,question_id,position,question_snapshot,options_snapshot)
 values ('20000007-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000006-0000-4000-8000-000000000000','20000004-0000-4000-8000-000000000000',1,'Question','[]');
insert into public.topic_images(id,user_id,topic_id,storage_key,original_filename,format,width,height,bytes,position)
 values ('20000009-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','20000003-0000-4000-8000-000000000000','2/image.webp','image.webp','webp',1,1,1,1000);
insert into public.trash_items(id,user_id,item_type,item_id,title) values ('20000008-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','topic','20000010-0000-4000-8000-000000000000','Deleted');
insert into public.study_goals(user_id,weekly_minutes) values ('20000000-0000-4000-8000-000000000000',240);
insert into public.study_task_deferrals(user_id,task_type,task_id,deferred_until)
 values ('20000000-0000-4000-8000-000000000000','topic','20000003-0000-4000-8000-000000000000',current_date);

select pg_temp.assert_true(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), 'RLS enabled on every application table');
select pg_temp.assert_true(not exists (
 select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.prosecdef or has_function_privilege('anon', p.oid, 'EXECUTE'))
), 'Public RPCs are invoker-only and unavailable anonymously');
select pg_temp.assert_true(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'SELECT')
), 'Anonymous users cannot read application tables');
select pg_temp.assert_true(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, 'TRUNCATE')
), 'Authenticated users cannot bypass RLS with TRUNCATE');
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  (
    public.get_exam_planning_scope(
      '10000001-0000-4000-8000-000000000000', 'UTC'
    )->>'chapterCount'
  )::integer = 1
  and (
    public.get_exam_planning_scope(
      '10000001-0000-4000-8000-000000000000', 'UTC'
    )->>'topicCount'
  )::integer = 1,
  'exam planning scope: returns current user module totals'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_exam_planning_chapters(
    '10000001-0000-4000-8000-000000000000'
  )->'chapters') = 1
  and (
    public.get_exam_planning_chapters(
      '10000001-0000-4000-8000-000000000000'
    )->'chapters'->0->>'topicCount'
  )::integer = 1,
  'exam planning chapters: returns current user chapter summaries'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_exam_planning_topics(
    '10000001-0000-4000-8000-000000000000', null, 'UTC'
  )) = 1
  and public.get_exam_planning_topics(
    '10000001-0000-4000-8000-000000000000', null, 'UTC'
  )->0->>'id' = '10000003-0000-4000-8000-000000000000',
  'exam planning topics: returns only current user topics'
);
do $$ declare rejected boolean := false; begin
  begin
    perform public.get_exam_planning_scope(
      '20000001-0000-4000-8000-000000000000', 'UTC'
    );
  exception when others then rejected := true;
  end;
  perform pg_temp.assert_true(rejected,
    'exam planning scope: rejects another user module');
end; $$;
insert into public.topics(user_id,chapter_id,slug,title,position)
select '10000000-0000-4000-8000-000000000000',
  '10000002-0000-4000-8000-000000000000',
  'scale-topic-' || item_index,
  'Scale topic ' || item_index,
  2000 + item_index
from generate_series(1, 1001) as item_index;
select pg_temp.assert_true(
  jsonb_array_length(public.get_exam_planning_topics(
    '10000001-0000-4000-8000-000000000000',
    array['10000002-0000-4000-8000-000000000000']::uuid[],
    'UTC'
  )) = 1002,
  'exam planning topics: returns more than the Data API row limit'
);
delete from public.topics where slug like 'scale-topic-%';
insert into public.chapters(user_id,module_id,slug,title,position)
select '10000000-0000-4000-8000-000000000000',
  '10000001-0000-4000-8000-000000000000',
  'scale-chapter-' || item_index,
  'Scale chapter ' || item_index,
  2000 + item_index
from generate_series(1, 1001) as item_index;
select pg_temp.assert_true(
  (public.get_exam_planning_chapters(
    '10000001-0000-4000-8000-000000000000'
  )->>'totalCount')::integer = 1002
  and jsonb_array_length(public.get_exam_planning_chapters(
    '10000001-0000-4000-8000-000000000000'
  )->'chapters') = 50
  and (public.get_exam_planning_chapters(
    '10000001-0000-4000-8000-000000000000'
  )->>'hasMore')::boolean,
  'exam planning chapters: cursor page is bounded above 1000 chapters'
);
delete from public.chapters where slug like 'scale-chapter-%';
select pg_temp.assert_true(
  (select slug = 'module-1' from public.modules
   where id = '10000001-0000-4000-8000-000000000000'),
  'module slug: generated from the module name'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(
     id = '10000001-0000-4000-8000-000000000000'
   )
   from public.get_module_summaries(target_module_slug => 'module-1')),
  'module summaries RPC: resolves the current user module by slug'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_offline_module_changes(
    '10000001-0000-4000-8000-000000000000'
  )->'chapters') = 1
  and jsonb_array_length(public.get_offline_module_changes(
    '10000001-0000-4000-8000-000000000000'
  )->'topics') = 1
  and jsonb_array_length(public.get_offline_module_changes(
    '10000001-0000-4000-8000-000000000000'
  )->'images') = 0,
  'offline sync RPC: returns owned text without optional images'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_offline_module_changes(
    '10000001-0000-4000-8000-000000000000', null, true
  )->'images') = 1,
  'offline sync RPC: includes image metadata only when requested'
);
select pg_temp.assert_true(
  public.get_offline_module_changes(
    '20000001-0000-4000-8000-000000000000'
  ) is null,
  'offline sync RPC: hides another user module'
);
select set_config(
  'test.offline_cursor',
  public.get_offline_module_changes(
    '10000001-0000-4000-8000-000000000000'
  )->>'serverTime',
  true
);
update public.topics set title = 'Topic updated offline'
where id = '10000003-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  jsonb_array_length(public.get_offline_module_changes(
    '10000001-0000-4000-8000-000000000000',
    current_setting('test.offline_cursor')::timestamptz
  )->'topics') = 1,
  'offline sync RPC: returns topics changed after the cursor'
);
select pg_temp.assert_true((select count(*) = 1 and min(weekly_minutes) = 180 from public.study_goals), 'study_goals: user 1 sees only own goal');
select pg_temp.assert_true(
  (select weekly_topics_enabled and not review_reminders_enabled
   and review_reminder_interval_days = 7
   from public.study_goals),
  'study_goals: preference defaults are available to the owner'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_study_statistics(null, 30, null, 'UTC')->'modules') = 1,
  'statistics RPC: global response contains only the current user modules'
);
select pg_temp.assert_true(
  (public.get_study_statistics('10000001-0000-4000-8000-000000000000', 30, null, 'UTC')->'weeklyGoal'->>'minutes')::integer = 180,
  'statistics RPC: returns the synchronized weekly goal'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(
     user_id = '10000000-0000-4000-8000-000000000000'
   ) from public.study_task_deferrals),
  'today deferrals: user 1 sees only own rows'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_today_dashboard('UTC')->'dueQuestions') = 1,
  'today RPC: returns only the current user due questions'
);
select pg_temp.assert_true(
  (public.get_today_dashboard('UTC')->>'dueQuestionCount')::integer = 1
  and public.get_today_dashboard('UTC')->'dueQuestions'->0->>'learningStatus' = 'new'
  and public.get_today_dashboard('UTC')->'sessionTarget'->>'moduleId'
    = '10000001-0000-4000-8000-000000000000',
  'today RPC: reports the complete FSRS queue, product state and matching session target'
);
insert into public.study_task_deferrals(user_id,task_type,task_id,deferred_until)
values ('10000000-0000-4000-8000-000000000000','question',
  '10000004-0000-4000-8000-000000000000', current_date + 1);
select pg_temp.assert_true(
  (public.get_today_dashboard('UTC')->>'dueQuestionCount')::integer = 0
  and public.get_today_dashboard('UTC')->'sessionTarget' = 'null'::jsonb,
  'today RPC: applies question deferrals to the queue and session target'
);
do $$ declare rejected boolean := false; begin
  begin
    perform public.create_fsrs_study_session(
      '10000001-0000-4000-8000-000000000000', 10, 'UTC');
  exception when others then rejected := true;
  end;
  perform pg_temp.assert_true(rejected,
    'FSRS quick session: cannot include a deferred question');
end; $$;
delete from public.study_task_deferrals
where task_type = 'question'
  and task_id = '10000004-0000-4000-8000-000000000000';
do $$ declare created_session uuid; begin
  created_session := public.create_fsrs_study_session(
    '10000001-0000-4000-8000-000000000000', 10, 'UTC');
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.study_session_items
      where session_id = created_session)
    and (select configuration->>'timeLimitMinutes' = '10'
      from public.study_sessions where id = created_session),
    'FSRS quick session: uses the due queue and persists its time limit');
  delete from public.study_sessions where id = created_session;
end; $$;
select public.record_fsrs_review(
  '10000007-0000-4000-8000-000000000000', 3::smallint,
  now(), null, 12, 0, 1);
select pg_temp.assert_true(
  (select state = 'learning' and repetitions = 1 and learning_steps = 1
    and stability = 2.3065 and abs(difficulty - 2.11810397) < 0.00000001
    and due_at between now() + interval '9 minutes'
      and now() + interval '11 minutes'
    from public.question_review_states
    where question_id = '10000004-0000-4000-8000-000000000000')
  and (select count(*) = 1 from public.question_review_logs
    where question_id = '10000004-0000-4000-8000-000000000000')
  and (select result = 'remembered' and active_duration_seconds = 12
    from public.study_session_items
    where id = '10000007-0000-4000-8000-000000000000'),
  'FSRS review RPC: atomically records an authoritative FSRS v6 transition'
);
do $$ declare queue_question_id uuid; item_index integer; begin
  for item_index in 1..9 loop
    queue_question_id := gen_random_uuid();
    insert into public.questions(id,user_id,module_id,content)
    values (queue_question_id, '10000000-0000-4000-8000-000000000000',
      '10000001-0000-4000-8000-000000000000',
      'Queue count test ' || item_index);
    insert into public.question_options(user_id,question_id,content,is_correct,position)
    values ('10000000-0000-4000-8000-000000000000', queue_question_id,
      'Answer', true, 1);
  end loop;
  perform pg_temp.assert_true(
    (public.get_today_dashboard('UTC')->>'dueQuestionCount')::integer = 9
    and jsonb_array_length(public.get_today_dashboard('UTC')->'dueQuestions') = 8,
    'today RPC: reports the full queue while limiting rendered rows');
  delete from public.questions where content like 'Queue count test %';
end; $$;
do $$ declare rejected boolean := false; begin
  begin
    perform public.record_fsrs_review(
      '20000007-0000-4000-8000-000000000000', 3::smallint,
      now(), null, 1, 0, 1);
  exception when others then rejected := true;
  end;
  perform pg_temp.assert_true(rejected,
    'FSRS review RPC: cannot record another user review');
end; $$;
do $$ declare affected integer; begin
 update public.study_task_deferrals set deferred_until = current_date + 7
 where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(
  affected = 0,
  'today deferrals: cannot update another user rows'
 );
end; $$;
update public.topics set completed = true
where id = '10000003-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  (select first_completed_at is not null from public.topics where id = '10000003-0000-4000-8000-000000000000'),
  'topic completion: records the completion date'
);
do $$ declare first_completion timestamptz; begin
 select first_completed_at into first_completion from public.topics
 where id = '10000003-0000-4000-8000-000000000000';
 update public.topics set completed = false
 where id = '10000003-0000-4000-8000-000000000000';
 perform pg_temp.assert_true(
   (select first_completed_at = first_completion from public.topics
    where id = '10000003-0000-4000-8000-000000000000'),
   'topic completion: unchecking preserves the first completion date'
 );
 update public.topics set completed = true
 where id = '10000003-0000-4000-8000-000000000000';
 perform pg_temp.assert_true(
   (select first_completed_at = first_completion from public.topics
    where id = '10000003-0000-4000-8000-000000000000'),
   'topic completion: rechecking does not create another completion'
 );
end; $$;
select pg_temp.assert_true(
  (public.get_progress_statistics('10000001-0000-4000-8000-000000000000', 30, 'UTC')->'summary'->>'completedTopics')::integer = 1,
  'progress statistics RPC: aggregates completed topics'
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_progress_statistics(null, 30, 'UTC')->'modules') = 1,
  'progress statistics RPC: global response contains only the current user modules'
);
select pg_temp.assert_true(
  not (public.get_progress_overview_statistics(null, 30, 'UTC') ? 'topics'),
  'progress overview RPC: does not return the full topic list'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(
     topic_id = '10000003-0000-4000-8000-000000000000'
   )
   from public.get_progress_topics_page(
     '10000001-0000-4000-8000-000000000000', 'chapter', 30
   )),
  'progress topic page RPC: returns only the current user topics'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_progress_topics_page(
    '10000001-0000-4000-8000-000000000000',
    completion_filter => 'completed'
  )),
  'progress topic page RPC: returns only completed topics'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_progress_topics_page(
    '10000001-0000-4000-8000-000000000000',
    completion_filter => 'incomplete'
  )),
  'progress topic page RPC: excludes completed topics from incomplete results'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_progress_topics_page(
    '20000001-0000-4000-8000-000000000000', 'chapter', 30
  )),
  'progress topic page RPC: hides another user module topics'
);
select pg_temp.assert_true(
  (select count(*) = 1 and min(completed_topics_count) = 1
   from public.get_module_summaries()),
  'module summaries RPC: returns progress only for the current user modules'
);
select pg_temp.assert_true(
  (public.get_progress_statistics(null, 30, 'UTC')->'weeklyGoal'->>'topics')::integer = 5,
  'progress statistics RPC: returns the weekly topic goal'
);
select pg_temp.assert_true(
  (public.get_progress_statistics(null, 30, 'UTC')->'weeklyGoal'->>'bestCompletedTopics')::integer = 1,
  'progress statistics RPC: returns the best unique weekly completion count'
);
do $$ declare affected integer; begin
 update public.study_goals set weekly_minutes = 300 where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_goals: cannot update another user goal');
end; $$;
do $$ begin
 begin
  perform public.get_study_statistics('20000001-0000-4000-8000-000000000000', 30, null, 'UTC');
  raise exception 'Cross-owner statistics RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nieprawidłowe filtry statystyk.' then raise; end if;
 end;
end; $$;
do $$ begin
 begin
  perform public.get_progress_statistics('20000001-0000-4000-8000-000000000000', 30, 'UTC');
  raise exception 'Cross-owner progress statistics RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nieprawidłowe filtry statystyk postępu.' then raise; end if;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.modules), 'modules: user 1 sees only own rows');
update public.modules set is_pinned = true
where id = '10000001-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(is_pinned)
   from public.get_module_summaries()),
  'module pinning: owner can pin a module and read it in summaries'
);
do $$ declare affected integer; begin
 update public.modules set is_pinned = true
 where id = '20000001-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(
  affected = 0,
  'module pinning: cannot pin another user module'
 );
end; $$;
do $$ declare affected integer; begin
 delete from public.modules where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'modules: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.modules set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'modules: cannot update another user rows');
 begin
  update public.modules set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for modules';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.chapters), 'chapters: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.chapters where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'chapters: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.chapters set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'chapters: cannot update another user rows');
 begin
  update public.chapters set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for chapters';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.topics), 'topics: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.topics where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topics: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.topics set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topics: cannot update another user rows');
 begin
  update public.topics set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for topics';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.questions), 'questions: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.questions where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'questions: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.questions set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'questions: cannot update another user rows');
 begin
  update public.questions set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for questions';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.question_options), 'question_options: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.question_options where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'question_options: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.question_options set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'question_options: cannot update another user rows');
 begin
  update public.question_options set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for question_options';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.study_sessions), 'study_sessions: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.study_sessions where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_sessions: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.study_sessions set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_sessions: cannot update another user rows');
 begin
  update public.study_sessions set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for study_sessions';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.study_session_items), 'study_session_items: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.study_session_items where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_session_items: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.study_session_items set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_session_items: cannot update another user rows');
 begin
  update public.study_session_items set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for study_session_items';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.topic_images), 'topic_images: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.topic_images where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topic_images: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.topic_images set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topic_images: cannot update another user rows');
 begin
  update public.topic_images set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for topic_images';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '10000000-0000-4000-8000-000000000000') from public.trash_items), 'trash_items: user 1 sees only own rows');
do $$ declare affected integer; begin
 delete from public.trash_items where user_id = '20000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'trash_items: cannot delete another user rows');
end; $$;

do $$ begin
 begin
  insert into public.topics(user_id,chapter_id,slug,title,position) values ('10000000-0000-4000-8000-000000000000','20000002-0000-4000-8000-000000000000','forbidden','Forbidden',2000);
  raise exception 'Cross-owner topic parent was accepted';
 exception when foreign_key_violation or insufficient_privilege then null;
 end;
 begin
  perform public.move_to_trash('module','20000001-0000-4000-8000-000000000000');
  raise exception 'Cross-owner trash RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nie znaleziono elementu.' then raise; end if;
 end;
 begin
  perform public.restore_trash_item('20000008-0000-4000-8000-000000000000');
  raise exception 'Cross-owner restore RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nie znaleziono elementu w koszu.' then raise; end if;
 end;
 begin
  perform public.purge_trash_item('20000008-0000-4000-8000-000000000000');
  raise exception 'Cross-owner purge RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nie znaleziono elementu w koszu.' then raise; end if;
 end;
end; $$;

select set_config(
  'test.exam_plan_id',
  public.save_exam_plan(jsonb_build_object(
    'moduleId', '10000001-0000-4000-8000-000000000000',
    'name', 'Exam plan',
    'examDate', '2099-06-30',
    'targetRetention', 0.9,
    'studyWeekdays', jsonb_build_array(1, 2, 3, 4, 5),
    'dailyTimeLimitMinutes', null,
    'dailyQuestionLimit', 32,
    'bufferPercent', 10,
    'includeUnassignedQuestions', false,
    'topicSettings', jsonb_build_array(jsonb_build_object(
      'id', '10000003-0000-4000-8000-000000000000',
      'workload_points', 2,
      'workload_source', 'automatic'
    )),
    'assignments', jsonb_build_array(jsonb_build_object(
      'topic_id', '10000003-0000-4000-8000-000000000000',
      'scheduled_for', '2099-06-01',
      'position', 1,
      'workload_points', 2,
      'is_locked', false,
      'completed_at', null
    )),
    'days', jsonb_build_array(jsonb_build_object(
      'target_date', '2099-06-01',
      'topic_count', 1,
      'workload_points', 2,
      'review_target', 4,
      'review_forecast_low', 3,
      'review_forecast_high', 5,
      'is_buffer_day', false,
      'is_overloaded', false
    ))
  ))::text,
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.exam_plans),
  'exam plans: owner can atomically create a plan'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.exam_plan_topics)
  and (select count(*) = 1 from public.exam_plan_assignments)
  and (select count(*) = 1 from public.exam_plan_daily_targets),
  'exam plans: scope, assignments and targets are persisted'
);
do $$
begin
  perform public.save_exam_plan(jsonb_build_object(
    'id', current_setting('test.exam_plan_id'),
    'expectedPlanVersion', 0
  ));
  raise exception 'A stale exam plan write was accepted';
exception when serialization_failure then null;
end;
$$;
select pg_temp.assert_true(
  (select plan_version = 1 from public.exam_plans),
  'exam plans: optimistic locking rejects a stale plan version'
);
set local role postgres;
insert into public.question_review_states(user_id, question_id)
values (
  '10000000-0000-4000-8000-000000000000',
  '10000004-0000-4000-8000-000000000000'
)
on conflict (user_id, question_id) do update
set version = public.question_review_states.version + 1;
set local role authenticated;
select pg_temp.assert_true(
  (select needs_rebuild from public.exam_plans),
  'exam plans: an FSRS state change marks the related plan for rebuilding'
);
update public.exam_plans set needs_rebuild = false;
update public.questions
set topic_id = null
where id = '10000004-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  (select needs_rebuild from public.exam_plans),
  'exam plans: a question scope change marks the related plan for rebuilding'
);
update public.questions
set topic_id = '10000003-0000-4000-8000-000000000000'
where id = '10000004-0000-4000-8000-000000000000';
update public.exam_plans set needs_rebuild = false;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000000';
select private.mark_exam_plans_dirty_for_question(
  '10000000-0000-4000-8000-000000000000',
  '10000001-0000-4000-8000-000000000000',
  '10000003-0000-4000-8000-000000000000'
);
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  not (select needs_rebuild from public.exam_plans),
  'exam plans: invoker RLS prevents marking another user plan'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000000';
select pg_temp.assert_true(
  (select count(*) = 0 from public.exam_plans)
  and (select count(*) = 0 from public.exam_plan_topics)
  and (select count(*) = 0 from public.exam_plan_assignments)
  and (select count(*) = 0 from public.exam_plan_daily_targets),
  'exam plans: another user cannot read plan data'
);
do $$ declare affected integer; begin
 delete from public.exam_plans
 where id = current_setting('test.exam_plan_id')::uuid;
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'exam plans: another user cannot delete a plan');
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.modules), 'modules: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.modules where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'modules: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.modules set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'modules: cannot update another user rows');
 begin
  update public.modules set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for modules';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.chapters), 'chapters: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.chapters where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'chapters: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.chapters set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'chapters: cannot update another user rows');
 begin
  update public.chapters set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for chapters';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.topics), 'topics: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.topics where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topics: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.topics set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topics: cannot update another user rows');
 begin
  update public.topics set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for topics';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.questions), 'questions: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.questions where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'questions: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.questions set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'questions: cannot update another user rows');
 begin
  update public.questions set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for questions';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.question_options), 'question_options: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.question_options where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'question_options: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.question_options set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'question_options: cannot update another user rows');
 begin
  update public.question_options set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for question_options';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.study_sessions), 'study_sessions: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.study_sessions where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_sessions: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.study_sessions set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_sessions: cannot update another user rows');
 begin
  update public.study_sessions set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for study_sessions';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.study_session_items), 'study_session_items: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.study_session_items where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_session_items: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.study_session_items set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'study_session_items: cannot update another user rows');
 begin
  update public.study_session_items set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for study_session_items';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.topic_images), 'topic_images: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.topic_images where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topic_images: cannot delete another user rows');
end; $$;
do $$ declare affected integer; begin
 update public.topic_images set user_id = '20000000-0000-4000-8000-000000000000' where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'topic_images: cannot update another user rows');
 begin
  update public.topic_images set user_id = '10000000-0000-4000-8000-000000000000' where user_id = '20000000-0000-4000-8000-000000000000';
  raise exception 'Owner reassignment was accepted for topic_images';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
end; $$;
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = '20000000-0000-4000-8000-000000000000') from public.trash_items), 'trash_items: user 2 sees only own rows');
do $$ declare affected integer; begin
 delete from public.trash_items where user_id = '10000000-0000-4000-8000-000000000000';
 get diagnostics affected = row_count;
 perform pg_temp.assert_true(affected = 0, 'trash_items: cannot delete another user rows');
end; $$;

do $$ begin
 begin
  insert into public.topics(user_id,chapter_id,slug,title,position) values ('20000000-0000-4000-8000-000000000000','10000002-0000-4000-8000-000000000000','forbidden','Forbidden',2000);
  raise exception 'Cross-owner topic parent was accepted';
 exception when foreign_key_violation or insufficient_privilege then null;
 end;
 begin
  perform public.move_to_trash('module','10000001-0000-4000-8000-000000000000');
  raise exception 'Cross-owner trash RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nie znaleziono elementu.' then raise; end if;
 end;
 begin
  perform public.restore_trash_item('10000008-0000-4000-8000-000000000000');
  raise exception 'Cross-owner restore RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nie znaleziono elementu w koszu.' then raise; end if;
 end;
 begin
  perform public.purge_trash_item('10000008-0000-4000-8000-000000000000');
  raise exception 'Cross-owner purge RPC was accepted';
 exception when raise_exception then
  if SQLERRM <> 'Nie znaleziono elementu w koszu.' then raise; end if;
 end;
end; $$;

-- Exercise the app RPCs, including their runtime SQL and ownership checks.
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000000';
select public.get_learning_summary('10000001-0000-4000-8000-000000000000');
select public.get_chapter_summaries('10000001-0000-4000-8000-000000000000');
select public.get_topic_navigation('10000001-0000-4000-8000-000000000000','10000003-0000-4000-8000-000000000000');
select pg_temp.assert_true(
 jsonb_array_length(public.get_chapter_summaries('20000001-0000-4000-8000-000000000000')) = 0,
 'Chapter summaries cannot cross module ownership'
);
select pg_temp.assert_true(
 (public.get_learning_summary('20000001-0000-4000-8000-000000000000')->>'totalChapters')::integer = 0,
 'Learning summary cannot cross module ownership'
);
select pg_temp.assert_true(
 public.get_topic_navigation('20000001-0000-4000-8000-000000000000','10000003-0000-4000-8000-000000000000') is null,
 'Topic navigation is restricted to the requested module'
);
select public.get_question_bank_availability('10000001-0000-4000-8000-000000000000',null,null,false);
select * from public.get_module_gallery_sections('10000001-0000-4000-8000-000000000000','manual',12,0,6);
select * from public.get_chapter_gallery_images('10000001-0000-4000-8000-000000000000','10000002-0000-4000-8000-000000000000',0,12);
select public.reorder_topics('10000002-0000-4000-8000-000000000000',array['10000003-0000-4000-8000-000000000000'::uuid]);
select public.reorder_topic_images('10000003-0000-4000-8000-000000000000',array['10000009-0000-4000-8000-000000000000'::uuid]);
do $$
declare
 imported_module_id uuid;
 duplicate_module_id uuid;
begin
 imported_module_id := public.import_docx_module(
  'Word import',
  3000,
  '[{"title":"Chapter from Word","slug":"chapter-from-word","position":1000,"topics":[{"title":"Topic from Word","slug":"topic-from-word","position":1000,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Imported content"}]}]}}]}]'::jsonb
 );
 perform pg_temp.assert_true(
  (select user_id = '10000000-0000-4000-8000-000000000000'
   from public.modules where id = imported_module_id),
  'DOCX import: creates an owned module'
 );
 perform pg_temp.assert_true(
  (select count(*) = 1 from public.chapters where module_id = imported_module_id),
  'DOCX import: creates chapters'
 );
 perform pg_temp.assert_true(
  (select count(*) = 1 and bool_and(content #>> '{content,0,content,0,text}' = 'Imported content')
   from public.topics where chapter_id in (
    select id from public.chapters where module_id = imported_module_id
   )),
  'DOCX import: creates topics with rich content'
 );

 duplicate_module_id := public.import_docx_module('Word import', 4000, '[]'::jsonb);
 perform pg_temp.assert_true(
  (select name = 'Word import (2)' from public.modules where id = duplicate_module_id),
  'DOCX import: adds a numeric suffix to a duplicate module name'
 );

 begin
  perform public.import_docx_module(
   'Broken import',
   5000,
   '[{"title":"Chapter","slug":"chapter","position":1000,"topics":[{"title":"","slug":"topic","position":1000,"content":{"type":"doc"}}]}]'::jsonb
  );
  raise exception 'Invalid DOCX import was accepted';
 exception when raise_exception then
  if SQLERRM = 'Invalid DOCX import was accepted' then raise; end if;
 end;
 perform pg_temp.assert_true(
  not exists (select 1 from public.modules where name = 'Broken import'),
  'DOCX import: invalid nested data rolls back the whole module'
 );
end;
$$;
do $$
declare
 question_module_id uuid;
begin
 question_module_id := public.import_question_module(
  'Anki import',
  5000,
  '[
    {"content":"Mitochondrium","explanation":"","chapterTitle":"Biologia","chapterSlug":"biologia","topicTitle":"Komórka","topicSlug":"komorka","options":[{"content":"Elektrownia komórki","isCorrect":true}]},
    {"content":"Stolica Polski?","explanation":"Warszawa jest stolicą od 1596 roku.","options":[{"content":"Kraków","isCorrect":false},{"content":"Warszawa","isCorrect":true},{"content":"Gdańsk","isCorrect":false}]}
  ]'::jsonb
 );
 perform pg_temp.assert_true(
  (select user_id = '10000000-0000-4000-8000-000000000000'
   from public.modules where id = question_module_id),
  'Question import: creates an owned module'
 );
 perform pg_temp.assert_true(
  (select count(*) = 2
      and count(*) filter (where chapter_id is not null and topic_id is not null) = 1
      and count(*) filter (where chapter_id is null and topic_id is null) = 1
   from public.questions where module_id = question_module_id),
  'Question import: assigns Anki deck hierarchy and keeps other questions unassigned'
 );
 perform pg_temp.assert_true(
  (select count(*) = 1 and bool_and(chapter.title = 'Biologia' and topic.title = 'Komórka')
   from public.chapters as chapter
   join public.topics as topic on topic.chapter_id = chapter.id
   where chapter.module_id = question_module_id),
  'Question import: creates chapters and topics from Anki decks'
 );
 perform pg_temp.assert_true(
  (select count(*) = 2
      and pg_catalog.min(option_count) = 1
      and pg_catalog.max(option_count) = 3
      and bool_and(correct_count = 1)
   from (
    select question.id,
      count(option.id) as option_count,
      count(option.id) filter (where option.is_correct) as correct_count
    from public.questions as question
    left join public.question_options as option on option.question_id = question.id
    where question.module_id = question_module_id
    group by question.id
   ) as imported_questions),
  'Question import: creates mixed flashcards and test questions'
 );
 perform pg_temp.assert_true(
  (select explanation = 'Warszawa jest stolicą od 1596 roku.'
   from public.questions
   where module_id = question_module_id and content = 'Stolica Polski?'),
  'Question import: stores explanations'
 );

 begin
  perform public.import_question_module(
   'Broken questions',
   6000,
   '[
     {"content":"Valid","explanation":"","options":[{"content":"Answer","isCorrect":true}]},
     {"content":"Invalid","explanation":"","options":[{"content":"A","isCorrect":true},{"content":"A","isCorrect":false}]}
   ]'::jsonb
  );
  raise exception 'Invalid question import was accepted';
 exception when raise_exception then
  if SQLERRM = 'Invalid question import was accepted' then raise; end if;
 end;
 perform pg_temp.assert_true(
  not exists (select 1 from public.modules where name = 'Broken questions'),
  'Question import: invalid nested data rolls back the whole module'
 );
end;
$$;
do $$
declare
 imported_chapter_id uuid;
 rejected boolean := false;
begin
 perform pg_temp.assert_true(
  public.import_docx_into_module(
   '10000001-0000-4000-8000-000000000000',
   '[{
     "title":"Existing import chapter",
     "slug":"chapter",
     "topics":[{
       "title":"Imported topic",
       "slug":"topic",
       "content":{"type":"doc","content":[{"type":"paragraph"}]}
     }]
   }]'::jsonb
  ) = 1,
  'Existing DOCX import: reports the number of appended chapters'
 );
 select id into imported_chapter_id
 from public.chapters
 where module_id = '10000001-0000-4000-8000-000000000000'
   and title = 'Existing import chapter';
 perform pg_temp.assert_true(
  (select slug = 'chapter-2' and position > 1000
   from public.chapters where id = imported_chapter_id)
  and (select count(*) = 1 from public.topics
       where chapter_id = imported_chapter_id and title = 'Imported topic'),
  'Existing DOCX import: appends an owned chapter, resolves its slug and stores topics'
 );

 perform pg_temp.assert_true(
  public.import_questions_into_module(
   '10000001-0000-4000-8000-000000000000',
   '[{
   "content":"Imported into existing module",
   "explanation":"Explanation",
   "chapterTitle":"Chapter",
   "chapterSlug":"chapter",
   "topicTitle":"Topic updated offline",
   "topicSlug":"topic",
     "options":[
       {"content":"Correct","isCorrect":true},
       {"content":"Wrong","isCorrect":false}
     ]
   }]'::jsonb
 ) = 1,
  'Existing question import: reports the number of appended questions'
 );
 perform pg_temp.assert_true(
  (select count(*) = 1
   from public.questions as question
   join public.question_options as option on option.question_id = question.id
   where question.module_id = '10000001-0000-4000-8000-000000000000'
     and question.content = 'Imported into existing module'
     and question.chapter_id = '10000002-0000-4000-8000-000000000000'
     and question.topic_id = '10000003-0000-4000-8000-000000000000'
     and option.is_correct),
  'Existing question import: reuses hierarchy and stores correct options'
 );

 begin
  perform public.import_questions_into_module(
   '20000001-0000-4000-8000-000000000000',
   '[{"content":"Forbidden","options":[{"content":"Answer","isCorrect":true}]}]'::jsonb
  );
 exception when raise_exception then
  rejected := true;
 end;
 perform pg_temp.assert_true(
  rejected,
  'Existing import RPCs cannot append to another user module'
 );

 delete from public.questions where content = 'Imported into existing module';
 delete from public.chapters where id = imported_chapter_id;
end;
$$;
do $$ declare test_question_id uuid; test_session_id uuid; flashcard_session_id uuid; test_trash_id uuid; begin
 test_question_id := public.save_question('10000001-0000-4000-8000-000000000000',null,'New question','',null,null,
  '[{"content":"Yes","isCorrect":true},{"content":"No","isCorrect":false}]'::jsonb);
 test_session_id := public.create_study_session('10000001-0000-4000-8000-000000000000','test','all',null,null,3,20);
 perform pg_temp.assert_true((select count(*) > 0 from public.study_session_items where study_session_items.session_id = test_session_id), 'Session has items');
 flashcard_session_id := public.create_study_session(
  '10000001-0000-4000-8000-000000000000',
  'flashcards',
  'all',
  null,
  null,
  3,
  20,
  true
 );
 perform pg_temp.assert_true(
  (select configuration->>'hideFlashcardOptions' = 'true'
   from public.study_sessions where id = flashcard_session_id),
  'Flashcard session persists hidden answer variants'
 );
 test_trash_id := public.move_to_trash('question',test_question_id);
 perform pg_temp.assert_true(not exists(select 1 from public.questions where id = test_question_id), 'Trashed question hidden');
 perform public.restore_trash_item(test_trash_id);
 perform pg_temp.assert_true(exists(select 1 from public.questions where id = test_question_id), 'Restored question visible');
 test_trash_id := public.move_to_trash('question',test_question_id);
 perform public.purge_trash_item(test_trash_id);
 perform pg_temp.assert_true(not exists(select 1 from public.trash_items where id = test_trash_id), 'Purged trash removed');
end; $$;
do $$
declare
 tree_chapter_trash_id uuid;
 tree_module_trash_id uuid;
 module_tree jsonb;
 chapter_source_path text[];
 first_page_ids uuid[];
 second_page_ids uuid[];
 page_cursor_deleted_at timestamptz;
 page_cursor_id uuid;
begin
 insert into public.modules(id,user_id,name,position)
 values ('30000001-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','Tree module',6000);
 insert into public.chapters(id,user_id,module_id,slug,title,position) values
  ('30000002-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','30000001-0000-4000-8000-000000000000','separate-chapter','Separate chapter',1000),
  ('30000003-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','30000001-0000-4000-8000-000000000000','restored-chapter','Restored chapter',2000),
  ('30000006-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','30000001-0000-4000-8000-000000000000','remaining-chapter','Remaining chapter',3000);
 insert into public.topics(id,user_id,chapter_id,slug,title,position) values
  ('30000004-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','30000002-0000-4000-8000-000000000000','separate-topic','Separate topic',1000),
  ('30000005-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','30000003-0000-4000-8000-000000000000','restored-topic','Restored topic',1000),
  ('30000007-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','30000006-0000-4000-8000-000000000000','remaining-topic','Remaining topic',1000);

 tree_chapter_trash_id := public.move_to_trash('chapter', '30000002-0000-4000-8000-000000000000');
 tree_module_trash_id := public.move_to_trash('module', '30000001-0000-4000-8000-000000000000');

 select page.tree
 into module_tree
 from public.list_trash_items_page(requested_page_size => 50) as page
 where page.id = tree_module_trash_id;
 select page.source_path
 into chapter_source_path
 from public.list_trash_items_page(requested_page_size => 50) as page
 where page.id = tree_chapter_trash_id;

 perform pg_temp.assert_true(
  jsonb_array_length(module_tree->'children') = 2,
  'trash tree: a later module deletion does not absorb an earlier chapter deletion'
 );
 perform pg_temp.assert_true(
  chapter_source_path = array['Tree module']::text[],
  'trash tree: a separately deleted chapter includes its source module'
 );

 select page.deleted_at, page.id
 into page_cursor_deleted_at, page_cursor_id
 from public.list_trash_items_page(requested_page_size => 1) as page
 order by page.deleted_at desc, page.id desc
 limit 1;
 first_page_ids := array[page_cursor_id];
 select array_agg(page.id order by page.deleted_at desc, page.id desc)
 into second_page_ids
 from public.list_trash_items_page(page_cursor_deleted_at, page_cursor_id, 1) as page;
 perform pg_temp.assert_true(
  cardinality(first_page_ids) = 1 and cardinality(second_page_ids) > 0
   and not (second_page_ids && first_page_ids),
  'trash tree: cursor pagination returns a non-overlapping next page'
 );

 perform public.restore_trash_node(
  tree_module_trash_id,
  'chapter',
  '30000003-0000-4000-8000-000000000000'
 );
 perform pg_temp.assert_true(
  exists (select 1 from public.modules where id = '30000001-0000-4000-8000-000000000000')
   and exists (select 1 from public.chapters where id = '30000003-0000-4000-8000-000000000000')
   and exists (select 1 from public.topics where id = '30000005-0000-4000-8000-000000000000'),
  'trash tree: restoring a chapter also restores its module and topics'
 );
 perform pg_temp.assert_true(
  not exists (select 1 from public.chapters where id = '30000002-0000-4000-8000-000000000000')
   and exists (select 1 from public.trash_items where id = tree_chapter_trash_id),
  'trash tree: an earlier chapter deletion remains a separate event'
 );
 perform pg_temp.assert_true(
  not exists (select 1 from public.chapters where id = '30000006-0000-4000-8000-000000000000')
   and exists (select 1 from public.trash_items where id = tree_module_trash_id),
  'trash tree: unselected sibling chapters remain in the module event'
 );

 select page.tree
 into module_tree
 from public.list_trash_items_page(requested_page_size => 50) as page
 where page.id = tree_module_trash_id;
 perform pg_temp.assert_true(
  module_tree->>'is_deleted' = 'false'
   and jsonb_array_length(module_tree->'children') = 1
   and module_tree #>> '{children,0,id}' = '30000006-0000-4000-8000-000000000000',
  'trash tree: after partial restore it shows the active parent and remaining branch'
 );
end;
$$;
-- Ordering is atomic: an inaccessible id must leave all positions unchanged.
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000000';
do $$ declare before_position integer; original jsonb; affected integer; begin
 select position into before_position from public.chapters where id = '10000002-0000-4000-8000-000000000000';
 begin
  perform public.reorder_chapters(array['10000002-0000-4000-8000-000000000000','20000002-0000-4000-8000-000000000000']::uuid[]);
  raise exception 'Expected rejected reorder' using errcode = 'XX000';
 exception when raise_exception then null;
 end;
 perform pg_temp.assert_true((select position = before_position from public.chapters where id = '10000002-0000-4000-8000-000000000000'), 'Rejected order leaves own chapter unchanged');
 perform public.reorder_chapters(array['10000002-0000-4000-8000-000000000000']::uuid[]);
 perform pg_temp.assert_true((select position = 1000 from public.chapters where id = '10000002-0000-4000-8000-000000000000'), 'Valid order is saved');
 select content into original from public.topics where id = '10000003-0000-4000-8000-000000000000';
 perform pg_temp.assert_true(public.save_topic_content(
   '10000002-0000-4000-8000-000000000000', '10000003-0000-4000-8000-000000000000',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Newer version"}]}]}'::jsonb, original
 ), 'Current content is saved');
 perform pg_temp.assert_true(not public.save_topic_content(
   '10000002-0000-4000-8000-000000000000', '10000003-0000-4000-8000-000000000000',
   '{"type":"doc"}'::jsonb, original
 ), 'Stale content cannot overwrite a newer note');
end; $$;
rollback;
