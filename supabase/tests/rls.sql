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
select pg_temp.assert_true((select count(*) = 1 and min(weekly_minutes) = 180 from public.study_goals), 'study_goals: user 1 sees only own goal');
select pg_temp.assert_true(
  jsonb_array_length(public.get_study_statistics(null, 30, null, 'UTC')->'modules') = 1,
  'statistics RPC: global response contains only the current user modules'
);
select pg_temp.assert_true(
  (public.get_study_statistics('10000001-0000-4000-8000-000000000000', 30, null, 'UTC')->'weeklyGoal'->>'minutes')::integer = 180,
  'statistics RPC: returns the synchronized weekly goal'
);
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

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000000';
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
do $$ declare test_question_id uuid; test_session_id uuid; test_trash_id uuid; begin
 test_question_id := public.save_question('10000001-0000-4000-8000-000000000000',null,'New question','',null,null,
  '[{"content":"Yes","isCorrect":true},{"content":"No","isCorrect":false}]'::jsonb);
 test_session_id := public.create_study_session('10000001-0000-4000-8000-000000000000','test','all',null,null,3,20);
 perform pg_temp.assert_true((select count(*) > 0 from public.study_session_items where study_session_items.session_id = test_session_id), 'Session has items');
 test_trash_id := public.move_to_trash('question',test_question_id);
 perform pg_temp.assert_true(not exists(select 1 from public.questions where id = test_question_id), 'Trashed question hidden');
 perform public.restore_trash_item(test_trash_id);
 perform pg_temp.assert_true(exists(select 1 from public.questions where id = test_question_id), 'Restored question visible');
 test_trash_id := public.move_to_trash('question',test_question_id);
 perform public.purge_trash_item(test_trash_id);
 perform pg_temp.assert_true(not exists(select 1 from public.trash_items where id = test_trash_id), 'Purged trash removed');
end; $$;
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
