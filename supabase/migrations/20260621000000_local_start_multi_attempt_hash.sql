alter table public.questions
  add column if not exists max_attempts integer not null default 1;

alter table public.submissions
  add column if not exists final_status text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists max_attempts_snapshot integer,
  add column if not exists final_answer text,
  add column if not exists client_started_at timestamptz,
  add column if not exists client_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_max_attempts_check'
  ) then
    alter table public.questions
      add constraint questions_max_attempts_check check (max_attempts between 1 and 99);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submissions_final_status_check'
  ) then
    alter table public.submissions
      add constraint submissions_final_status_check
      check (final_status is null or final_status in ('correct', 'timeout', 'attempt_limit_exceeded'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submissions_attempt_count_check'
  ) then
    alter table public.submissions
      add constraint submissions_attempt_count_check check (attempt_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submissions_max_attempts_snapshot_check'
  ) then
    alter table public.submissions
      add constraint submissions_max_attempts_snapshot_check
      check (max_attempts_snapshot is null or max_attempts_snapshot between 1 and 99);
  end if;

end;
$$;

update public.submissions
set
  final_status = case when is_correct then 'correct' else 'attempt_limit_exceeded' end,
  attempt_count = 1,
  max_attempts_snapshot = coalesce(max_attempts_snapshot, 1),
  final_answer = coalesce(final_answer, submitted_answer)
where final_status is null
  and answer_elapsed_ms is not null;

create unique index if not exists submissions_unique_room_participant_question_final_completed
on public.submissions (room_id, participant_id, question_id)
where final_status is not null;
