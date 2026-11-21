-- Choque de horario entre sesiones: comparar rangos, no solo la hora de inicio.
--
-- check_session_datetime_conflict solo rechazaba dos sesiones del mismo día con el mismo
-- start_time. Una sesión larga (hackathon 09:00–11:00) dejaba inscribirse además a otra de las
-- 10:00 y la persona ocupaba un cupo que no iba a usar.
--
-- Ahora chocan si empiezan a la vez o si [start_time, end_time) se cruzan. Sin end_time la
-- sesión cuenta como un instante, así que entre sesiones sin fin el criterio es el de antes.
-- Solo reemplaza la función del trigger; no cambia datos ni inscripciones existentes.
-- El sitio de registro (eventos-gdg-tarija, session-schedule.ts) aplica el mismo criterio.

create or replace function public.check_session_datetime_conflict()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_date     date;
  v_start    time;
  v_end      time;
  v_conflict text;
begin
  select s.date, s.start_time, coalesce(s.end_time, s.start_time)
    into v_date, v_start, v_end
    from public.sessions s
   where s.id = new.session_id;

  -- Solo validar cuando la sesión tiene fecha y hora definidas.
  if v_date is null or v_start is null then
    return new;
  end if;

  select s.title
    into v_conflict
    from public.session_registrations sr
    join public.sessions s on s.id = sr.session_id
   where sr.registration_id = new.registration_id
     and sr.session_id     <> new.session_id
     and s.date             = v_date
     and s.start_time is not null
     and (
       s.start_time = v_start
       or (s.start_time < v_end and v_start < coalesce(s.end_time, s.start_time))
     )
   limit 1;

  if v_conflict is not null then
    raise exception
      'Conflicto de horario: esta sesión se cruza con «%», en la que ya estás inscrito.',
      v_conflict
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
