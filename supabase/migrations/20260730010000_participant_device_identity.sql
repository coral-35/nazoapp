alter table public.participants
  add column if not exists device_token_hash text;

create unique index if not exists participants_unique_room_device
on public.participants (room_id, device_token_hash)
where device_token_hash is not null;
