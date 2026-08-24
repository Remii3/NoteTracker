begin;

create or replace function public.delete_notes_bulk(
  chapter_ids uuid[] default array[]::uuid[],
  topic_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.delete_notes_bulk(uuid[], uuid[]) from public;
grant execute on function public.delete_notes_bulk(uuid[], uuid[]) to authenticated;

commit;
