begin;

-- The existing (user_id, chapter_id, ...) index cannot efficiently support
-- foreign-key checks that start with chapter_id.
create index if not exists topics_chapter_id_idx
  on public.topics (chapter_id);

-- This trigger helper does not need to be called through the Data API.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

commit;

