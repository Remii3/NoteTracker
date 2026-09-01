begin;

create or replace function public.get_module_image_keys(target_module_id uuid)
returns table (storage_key text)
language sql
stable
security invoker
set search_path = ''
as $$
  select image.storage_key
  from public.topic_images as image
  join public.topics as topic
    on topic.id = image.topic_id and topic.user_id = image.user_id
  join public.chapters as chapter
    on chapter.id = topic.chapter_id and chapter.user_id = topic.user_id
  where chapter.module_id = target_module_id
    and chapter.user_id = (select auth.uid());
$$;

create or replace function public.delete_module_cascade(target_module_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.modules
  where id = target_module_id and user_id = (select auth.uid());
  if not found then raise exception 'Nie znaleziono modułu.'; end if;
end;
$$;

revoke all on function public.get_module_image_keys(uuid) from public;
revoke all on function public.delete_module_cascade(uuid) from public;
grant execute on function public.get_module_image_keys(uuid) to authenticated;
grant execute on function public.delete_module_cascade(uuid) to authenticated;

commit;
