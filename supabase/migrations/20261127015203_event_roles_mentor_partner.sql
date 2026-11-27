-- Roles de evento nuevos: Mentor (MENTOR) y Comunidad aliada (PARTNER).
--
-- Son roles de la inscripción (los da un cupón), no accesos al back-office. Como todo cupón que no
-- es de Asistente, el trigger de inscripciones ya los confirma sin pago y no ocupan cupo de los
-- paquetes (el cupo solo cuenta ATTENDEE).
--
-- Sorteo:
--   - Comunidad aliada participa, igual que los asistentes.
--   - Mentor no participa (como Expositor, Sponsor y Staff).
--   - Networking (escanearse entre personas) ya vale para cualquier rol; dar tickets de actividad
--     (can_award_tickets) sigue siendo solo de Expositor, Sponsor y Staff.
--
-- Solo amplía lo permitido: no cambia ni restringe datos existentes.

-- 1. Valores permitidos ---------------------------------------------------------------------------

alter table public.event_coupons drop constraint event_coupons_role_check;
alter table public.event_coupons add constraint event_coupons_role_check
  check (role in ('ATTENDEE', 'SPEAKER', 'SPONSOR', 'STAFF', 'MENTOR', 'PARTNER'));

alter table public.registrations drop constraint registrations_event_role_check;
alter table public.registrations add constraint registrations_event_role_check
  check (event_role in ('ATTENDEE', 'SPEAKER', 'SPONSOR', 'STAFF', 'MENTOR', 'PARTNER'));

-- 2. Sorteo: entra quien está CONFIRMED, como Asistente o Comunidad aliada, con cuenta activa, hizo
--    check-in y todavía no ganó. Solo cambia el filtro de rol respecto de 20261122092228.

create or replace function public.draw_raffle(p_event_id uuid, p_prize text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Espacios, tabs, saltos e invisibles (NBSP, ancho cero, marcas de dirección, rellenos Hangul que
  -- Unicode cuenta como letras) se reducen a un espacio: no cuentan como premio.
  v_prize text := btrim(regexp_replace(
    coalesce(p_prize, ''),
    '[\s ­ᅟᅠ᠎​-‏‪-‮⁠-⁤⠀ㅤ﻿ﾠ]+',
    ' ', 'g'));
  v_pick  record;
  v_name  text;
begin
  if not public.is_superadmin() then
    raise exception 'Solo un superadministrador puede sortear.' using errcode = '42501';
  end if;
  -- Exigir una letra o número descarta de una vez cualquier carácter invisible.
  if v_prize !~ '[[:alnum:]]' then
    raise exception 'Escribe el premio.' using errcode = '22023';
  end if;
  if length(v_prize) > 200 then
    raise exception 'El premio es demasiado largo (máximo 200 caracteres).' using errcode = '22023';
  end if;

  -- Un sorteo a la vez por evento: dos clics o dos pestañas no eligen a la misma persona.
  perform pg_advisory_xact_lock(hashtext('draw_raffle:' || p_event_id));

  with pool as (
    select t.registration_id as id, count(*)::int as tickets
    from public.raffle_tickets(p_event_id) t
    join public.registrations r on r.id = t.registration_id
    where r.status = 'CONFIRMED'
      and r.event_role in ('ATTENDEE', 'PARTNER')
      and r.user_id is not null
      and not exists (
        select 1 from public.raffle_winners w
        where w.event_id = p_event_id and w.registration_id = r.id
      )
    group by t.registration_id
    having bool_or(t.kind = 'checkin')
  )
  select pool.id, pool.tickets, (select count(*) from pool)::int as participants
  into v_pick
  from pool
  -- Muestreo exponencial: la chance de salir es proporcional a los tickets de cada persona.
  order by -ln(1 - random()) / pool.tickets
  limit 1;

  if not found then
    return jsonb_build_object('status', 'empty');
  end if;

  insert into public.raffle_winners (event_id, registration_id, prize, tickets)
  values (p_event_id, v_pick.id, v_prize, v_pick.tickets);

  select trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) into v_name
  from public.registrations r
  join public.users u on u.id = r.user_id
  where r.id = v_pick.id;

  return jsonb_build_object(
    'status', 'ok',
    'registration_id', v_pick.id,
    'name', v_name,
    'tickets', v_pick.tickets,
    'participants', v_pick.participants
  );
end;
$$;
