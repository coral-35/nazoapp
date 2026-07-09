alter table public.submissions
  add column if not exists answered_before_reveal boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_answered_before_reveal_check'
  ) then
    alter table public.submissions
      add constraint submissions_answered_before_reveal_check
      check (
        not answered_before_reveal
        or (is_correct and final_status = 'correct' and answer_elapsed_ms = 0)
      );
  end if;
end;
$$;
