do $$
declare
  target_room record;
  candidate_code text;
begin
  for target_room in
    select id
    from public.rooms
    where room_code !~ '^[0-9]{6}$'
  loop
    loop
      candidate_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
      exit when not exists (
        select 1
        from public.rooms
        where room_code = candidate_code
      );
    end loop;

    update public.rooms
    set room_code = candidate_code
    where id = target_room.id;
  end loop;
end;
$$;

alter table public.rooms
  drop constraint if exists rooms_room_code_numeric_check;

alter table public.rooms
  add constraint rooms_room_code_numeric_check
  check (room_code ~ '^[0-9]{6}$');
