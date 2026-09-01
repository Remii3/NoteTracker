begin;

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  position bigint not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index modules_user_position_id_idx
  on public.modules (user_id, position, id);

alter table public.modules enable row level security;
revoke all on table public.modules from anon, authenticated;
grant select, insert, update, delete on table public.modules to authenticated;

create policy "Users select own modules" on public.modules for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own modules" on public.modules for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own modules" on public.modules for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own modules" on public.modules for delete
  to authenticated using ((select auth.uid()) = user_id);

alter table public.chapters add column module_id uuid;

insert into public.modules (user_id, name, position)
select distinct user_id, 'Moje notatki', 1000
from public.chapters;

update public.chapters chapter
set module_id = module.id
from public.modules module
where module.user_id = chapter.user_id
  and module.name = 'Moje notatki'
  and chapter.module_id is null;

alter table public.chapters alter column module_id set not null;
alter table public.chapters add constraint chapters_module_owner_fkey
  foreign key (module_id, user_id) references public.modules (id, user_id)
  on delete cascade;

create index chapters_module_user_position_id_idx
  on public.chapters (module_id, user_id, position, id);

commit;
