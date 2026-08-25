begin;

create unique index if not exists topics_id_user_id_unique
  on public.topics (id, user_id);

create table if not exists public.topic_images (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null,
  format text not null check (format in ('webp')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes bigint not null check (bytes > 0),
  position bigint not null,
  created_at timestamptz not null default now(),
  constraint topic_images_topic_owner_fkey
    foreign key (topic_id, user_id)
    references public.topics (id, user_id)
    on delete cascade
);

create index if not exists topic_images_topic_user_position_id_idx
  on public.topic_images (topic_id, user_id, position, id);

create index if not exists topic_images_user_id_idx
  on public.topic_images (user_id);

alter table public.topic_images enable row level security;

drop policy if exists "Users can read own topic images" on public.topic_images;
create policy "Users can read own topic images"
  on public.topic_images
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own topic images" on public.topic_images;
create policy "Users can insert own topic images"
  on public.topic_images
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own topic images" on public.topic_images;
create policy "Users can update own topic images"
  on public.topic_images
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own topic images" on public.topic_images;
create policy "Users can delete own topic images"
  on public.topic_images
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.topic_images from anon;
grant select, insert, update, delete on table public.topic_images
  to authenticated;

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
