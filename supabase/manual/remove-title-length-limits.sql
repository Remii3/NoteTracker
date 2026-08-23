begin;

alter table public.chapters
  drop constraint if exists chapters_title_not_blank;

alter table public.chapters
  add constraint chapters_title_not_blank
  check (char_length(btrim(title)) > 0);

alter table public.topics
  drop constraint if exists topics_title_not_blank;

alter table public.topics
  add constraint topics_title_not_blank
  check (char_length(btrim(title)) > 0);

commit;
