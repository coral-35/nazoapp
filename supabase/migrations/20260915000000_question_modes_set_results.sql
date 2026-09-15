-- Keep historical score columns for compatibility; new results use submissions only.
alter table public.rooms add column if not exists questions_per_set integer not null default 7
  check (questions_per_set between 1 and 1000);
alter table public.questions add column if not exists mode text not null default 'normal'
  check (mode in ('normal', 'multiple_choice'));
alter table public.questions add constraint questions_choice_answer_check
  check (mode <> 'multiple_choice' or answer_text in ('A', 'B', 'C', 'D'));
