-- NO APLICADA. tracks.evento_id no tiene FK a events en la BD real: al borrar un evento
-- quedan tracks huérfanos y se pueden crear tracks de eventos inexistentes.
-- La migración aborta si ya existen huérfanos, para que decidas qué hacer con ellos
-- (revisar: select * from public.tracks where evento_id not in (select id from public.events);)

do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
  from public.tracks t
  where not exists (select 1 from public.events e where e.id = t.evento_id);

  if v_orphans > 0 then
    raise exception 'Hay % track(s) huérfanos; límpialos antes de agregar la FK.', v_orphans;
  end if;
end $$;

alter table public.tracks
  drop constraint if exists tracks_evento_id_fkey;
alter table public.tracks
  add constraint tracks_evento_id_fkey
  foreign key (evento_id) references public.events (id) on delete cascade;

create index if not exists tracks_evento_id_idx on public.tracks (evento_id);
