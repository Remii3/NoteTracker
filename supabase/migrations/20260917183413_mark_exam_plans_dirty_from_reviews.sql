create function private.mark_exam_plans_dirty_for_question(
  owner_id uuid,
  target_module_id uuid,
  target_topic_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.exam_plans as plan
  set needs_rebuild = true,
    updated_at = now()
  where plan.user_id = owner_id
    and plan.module_id = target_module_id
    and plan.status = 'active'
    and (
      exists (
        select 1
        from public.exam_plan_topics as scope
        where scope.exam_plan_id = plan.id
          and scope.user_id = owner_id
          and scope.topic_id = target_topic_id
      )
      or (
        target_topic_id is null
        and plan.include_unassigned_questions
      )
    );
$$;

create function private.mark_exam_plans_dirty_on_review_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_question_id uuid;
  owner_id uuid;
  target_module_id uuid;
  target_topic_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_question_id := old.question_id;
  else
    changed_question_id := new.question_id;
  end if;

  select question.user_id, question.module_id, question.topic_id
  into owner_id, target_module_id, target_topic_id
  from public.questions as question
  where question.id = changed_question_id;

  if owner_id is not null then
    perform private.mark_exam_plans_dirty_for_question(
      owner_id,
      target_module_id,
      target_topic_id
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger mark_exam_plans_dirty_on_review_change
after insert or update or delete on public.question_review_states
for each row execute function private.mark_exam_plans_dirty_on_review_change();

create function private.mark_exam_plans_dirty_on_question_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.mark_exam_plans_dirty_for_question(
      old.user_id,
      old.module_id,
      old.topic_id
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform private.mark_exam_plans_dirty_for_question(
      new.user_id,
      new.module_id,
      new.topic_id
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger mark_exam_plans_dirty_on_question_change
after insert or update of module_id, topic_id, trash_id or delete
on public.questions
for each row execute function private.mark_exam_plans_dirty_on_question_change();

revoke all on function private.mark_exam_plans_dirty_for_question(uuid, uuid, uuid)
  from public;
grant execute on function private.mark_exam_plans_dirty_for_question(uuid, uuid, uuid)
  to authenticated;
revoke all on function private.mark_exam_plans_dirty_on_review_change()
  from public;
revoke all on function private.mark_exam_plans_dirty_on_question_change()
  from public;
