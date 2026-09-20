alter table public.questions
  add column if not exists is_adopted boolean not null default true;

alter table public.questions
  drop constraint if exists questions_room_id_order_index_key;
alter table public.questions
  drop constraint if exists questions_event_id_order_index_key;
alter table public.questions
  add constraint questions_event_id_order_index_key
  unique (event_id, order_index) deferrable initially deferred;

create or replace function public.organize_event_questions(
  target_event_id uuid,
  ordered_question_ids uuid[],
  adopted_question_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  event_question_count integer;
begin
  select count(*) into event_question_count from questions where event_id = target_event_id;
  if cardinality(ordered_question_ids) <> event_question_count
    or (select count(distinct value) from unnest(ordered_question_ids) value) <> event_question_count
    or exists (
      select 1 from unnest(ordered_question_ids) value
      where not exists (select 1 from questions q where q.id = value and q.event_id = target_event_id)
    ) then
    raise exception 'ordered question IDs do not match the event';
  end if;
  if cardinality(adopted_question_ids) <> (select count(distinct value) from unnest(adopted_question_ids) value)
    or exists (
    select 1 from unnest(adopted_question_ids) value
    where not (value = any(ordered_question_ids))
  ) then
    raise exception 'adopted question IDs do not match the event';
  end if;

  set constraints questions_event_id_order_index_key deferred;
  with requested as (
    select value as id, ordinality as requested_order,
      value = any(adopted_question_ids) as adopted
    from unnest(ordered_question_ids) with ordinality as item(value, ordinality)
  ), positioned as (
    select id, adopted,
      row_number() over (order by adopted desc, requested_order)::integer as new_order
    from requested
  )
  update questions q set order_index = positioned.new_order, is_adopted = positioned.adopted
  from positioned where q.id = positioned.id and q.event_id = target_event_id;
end;
$$;

grant execute on function public.organize_event_questions(uuid, uuid[], uuid[]) to service_role;
