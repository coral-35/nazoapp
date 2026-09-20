alter table public.event_settings
  add column if not exists set_question_counts jsonb not null default '[7]'::jsonb;

alter table public.questions
  add column if not exists is_practice boolean not null default false;

create or replace function public.replace_question_answer_aliases(
  target_question_id uuid,
  alias_texts text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.answer_aliases where question_id = target_question_id;

  insert into public.answer_aliases (question_id, alias_text, normalized_alias)
  select target_question_id, value, lower(value)
  from unnest(alias_texts) as value
  where length(trim(value)) > 0;
end;
$$;

grant execute on function public.replace_question_answer_aliases(uuid, text[]) to service_role;
