create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  title text not null,
  status text not null default 'waiting' check (status in ('draft', 'waiting', 'question_open', 'question_closed', 'finished')),
  current_question_id uuid,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  total_score integer not null default 0 check (total_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, name)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null,
  image_url text,
  image_path text,
  answer_text text not null,
  normalized_answer text not null,
  points integer not null default 10 check (points > 0),
  order_index integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, order_index)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_current_question_id_fkey'
  ) then
    alter table public.rooms
      add constraint rooms_current_question_id_fkey
      foreign key (current_question_id) references public.questions(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.answer_aliases (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  alias_text text not null,
  normalized_text text not null,
  created_at timestamptz not null default now(),
  unique (question_id, normalized_text)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  submitted_answer text not null,
  normalized_submitted_answer text not null,
  is_correct boolean not null,
  awarded_points integer not null default 0 check (awarded_points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  points integer not null check (points > 0),
  reason text not null default 'correct_answer',
  created_at timestamptz not null default now(),
  unique (participant_id, question_id)
);

create index if not exists participants_room_id_idx on public.participants(room_id);
create index if not exists questions_room_id_idx on public.questions(room_id);
create index if not exists submissions_room_question_idx on public.submissions(room_id, question_id);
create index if not exists score_events_room_id_idx on public.score_events(room_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists participants_set_updated_at on public.participants;
create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

create or replace function public.increment_participant_score(target_participant_id uuid, delta integer)
returns table(total_score integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.participants
  set total_score = participants.total_score + delta
  where id = target_participant_id
  returning participants.total_score into total_score;

  return next;
end;
$$;

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.questions enable row level security;
alter table public.answer_aliases enable row level security;
alter table public.submissions enable row level security;
alter table public.score_events enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
