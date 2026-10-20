-- A chapter name and URL slug only identify a chapter inside its module.
-- Older environments enforced both values globally for each user, which
-- prevented reusing a chapter name in another module.
alter table public.chapters
  drop constraint if exists chapters_user_id_slug_key;

drop index if exists public.chapters_user_title_unique_idx;

create unique index if not exists chapters_module_slug_idx
  on public.chapters (module_id, slug)
  where trash_id is null;

create unique index if not exists chapters_module_title_unique_idx
  on public.chapters (module_id, lower(btrim(title)))
  where trash_id is null;
