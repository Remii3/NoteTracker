create function public.bulk_assign_questions(
  target_module_id uuid,
  question_ids uuid[],
  selected_chapter_id uuid,
  selected_topic_id uuid default null
) returns integer
language plpgsql
set search_path = ''
as $$
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

revoke all on function public.bulk_assign_questions(uuid, uuid[], uuid, uuid)
from public, anon;
grant execute on function public.bulk_assign_questions(uuid, uuid[], uuid, uuid)
to authenticated;
