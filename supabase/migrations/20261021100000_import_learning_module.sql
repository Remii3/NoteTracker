-- Import mixed learning material in one transaction. If question validation or
-- insertion fails, PostgreSQL rolls back the module, chapters and topics too.
create function public.import_learning_module(
  target_name text,
  target_position bigint,
  imported_chapters jsonb,
  imported_questions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  module_id uuid;
begin
  module_id := public.import_docx_module(
    target_name,
    target_position,
    imported_chapters
  );
  perform public.import_questions_into_module(module_id, imported_questions);
  return module_id;
end;
$$;

revoke all on function public.import_learning_module(text, bigint, jsonb, jsonb)
  from public, anon;
grant execute on function public.import_learning_module(text, bigint, jsonb, jsonb)
  to authenticated;
