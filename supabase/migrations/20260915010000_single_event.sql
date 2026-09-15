-- Preserve existing results and relationships when converting to one event.
alter table public.rooms rename to event_settings;
alter table public.participants rename column room_id to event_id;
alter table public.questions rename column room_id to event_id;
alter table public.submissions rename column room_id to event_id;
alter table public.score_events rename column room_id to event_id;
-- Foreign keys, RLS and grants follow table/column renames automatically.
