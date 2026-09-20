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

  insert into public.answer_aliases (question_id, alias_text, normalized_text)
  select distinct on (regexp_replace(lower(value), '\s+', '', 'g'))
    target_question_id,
    trim(value),
    regexp_replace(lower(value), '\s+', '', 'g')
  from unnest(alias_texts) as value
  where length(trim(value)) > 0;
end;
$$;

grant execute on function public.replace_question_answer_aliases(uuid, text[]) to service_role;
