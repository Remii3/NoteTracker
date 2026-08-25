begin;

create or replace function public.reorder_topic_images(
  target_topic_id uuid,
  image_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.reorder_topic_images(uuid, uuid[]) from public;
grant execute on function public.reorder_topic_images(uuid, uuid[])
  to authenticated;

commit;
