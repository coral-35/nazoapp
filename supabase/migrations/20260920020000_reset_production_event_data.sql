do $$
declare
  target_event_id uuid := '1098b22c-0ec8-4c9c-a883-df28ae5d06fa';
begin
  update public.event_settings
  set current_question_id = null,
      status = 'waiting',
      questions_per_set = 7,
      show_results = false
  where id = target_event_id;

  delete from public.submissions where event_id = target_event_id;
  delete from public.participants where event_id = target_event_id;
  delete from public.questions where event_id = target_event_id;
end $$;
