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

commit;

