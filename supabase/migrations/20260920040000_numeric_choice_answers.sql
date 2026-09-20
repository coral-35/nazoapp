alter table public.questions drop constraint if exists questions_choice_answer_check;

update public.questions
set answer_text = case answer_text
  when 'A' then '1'
  when 'B' then '2'
  when 'C' then '3'
  when 'D' then '4'
  else answer_text
end,
normalized_answer = case answer_text
  when 'A' then '1'
  when 'B' then '2'
  when 'C' then '3'
  when 'D' then '4'
  else normalized_answer
end
where mode = 'multiple_choice';

alter table public.questions add constraint questions_choice_answer_check
  check (mode <> 'multiple_choice' or answer_text in ('1', '2', '3', '4'));
