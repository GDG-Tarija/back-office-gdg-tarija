-- Sorteo por tickets: cada asistente suma tickets por hacer check-in, por actividades (stands,
-- preguntas en charlas, Zona Zen, hackathon…) y por networking. 1 ticket = 1 chance en el sorteo.
--
-- Reutiliza scan_logs: UNIQUE(registration_id, scan_type) ya da "una vez por actividad / pareja",
-- y el trigger de inscripciones anuladas y la auditoría ya aplican.
--   checkin                         → 1 ticket (y requisito para entrar al sorteo)
--   pts:<point_activities.id>       → 1 ticket por actividad (lo da staff, speaker o sponsor)
--   net:<registrations.id del otro> → 1 ticket por networking a cada lado (tope por persona)
-- Los tickets solo los escribe scan_ticket(); la API ya no deja insertarlos a mano.
--
-- No cambia datos existentes. scan_type se agranda para que quepa un UUID completo.

-- 1. scan_logs acepta los tickets nuevos ---------------------------------------------------------

alter table public.scan_logs alter column scan_type type varchar(50);

alter table public.scan_logs drop constraint scan_logs_scan_type_check;
alter table public.scan_logs add constraint scan_logs_scan_type_check check (
  scan_type in ('checkin', 'refrigerio', 'session')
  or scan_type like 'session_entry:%'
  or scan_type like 'pts:%'
  or scan_type like 'net:%'
);

-- Sin esto un staff con acceso al evento podía insertar pts:/net: inventados por la API y saltarse
-- "una vez por actividad" y el tope de networking. El resto de la policy queda igual.
drop policy "staff_insert_scan_logs" on public.scan_logs;
create policy "staff_insert_scan_logs" on public.scan_logs
  for insert to authenticated
  with check (
    scan_type not like 'pts:%'
    and scan_type not like 'net:%'
    and (
      public.is_superadmin()
      or exists (
        select 1 from public.registrations r
        where r.id = scan_logs.registration_id and public.has_event_access(r.event_id)
      )
    )
  );

-- Sin check-in no hay tickets: si la puerta deshace un check-in (o se borra la inscripción), se van
-- los tickets de esa persona y el networking que otros sumaron con ella. Si no, quedarían filas que
-- dan certificado de asistencia sin haber entrado.
create or replace function public.drop_tickets_without_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scan_logs
  where (registration_id = old.registration_id and (scan_type like 'pts:%' or scan_type like 'net:%'))
     or scan_type = 'net:' || old.registration_id;
  return null;
end;
$$;

revoke all on function public.drop_tickets_without_checkin() from public, anon, authenticated;

create trigger trg_drop_tickets_without_checkin after delete on public.scan_logs
  for each row when (old.scan_type = 'checkin')
  execute function public.drop_tickets_without_checkin();

-- 2. Actividades que dan ticket ------------------------------------------------------------------
-- Se cargan por SQL (datos) antes del evento; todavía no hay pantalla para editarlas.

create table public.point_activities (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Correr dos veces el script de carga no duplica actividades (ni sus tickets).
  unique (event_id, name)
);

comment on table public.point_activities is
  'Actividades del sorteo (stand, pregunta en una charla, Zona Zen…). Cada una da 1 ticket por persona: scan_logs.scan_type = pts:<id>.';

create trigger trg_set_updated_at before update on public.point_activities
  for each row execute function public.set_updated_at();
create trigger trg_audit_row_change after insert or update or delete on public.point_activities
  for each row execute function public.audit_row_change();

alter table public.point_activities enable row level security;

-- Los nombres no son sensibles: quien escanea en la web elige la actividad de esta lista.
create policy authenticated_read_point_activities on public.point_activities
  for select to authenticated
  using (true);

-- 3. Ganadores ------------------------------------------------------------------------------------

create table public.raffle_winners (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  prize           text not null,
  tickets         int not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, registration_id)
);

comment on table public.raffle_winners is
  'Ganadores del sorteo. Solo los escribe draw_raffle(); nadie gana dos veces en el mismo evento.';

create trigger trg_set_updated_at before update on public.raffle_winners
  for each row execute function public.set_updated_at();
create trigger trg_audit_row_change after insert or update or delete on public.raffle_winners
  for each row execute function public.audit_row_change();

alter table public.raffle_winners enable row level security;

create policy superadmin_read_raffle_winners on public.raffle_winners
  for select to authenticated
  using (public.is_superadmin());

-- 4. Reglas compartidas ---------------------------------------------------------------------------

create or replace function public.networking_ticket_cap()
returns int
language sql
immutable
as $$
  -- shortcut: el mismo tope para todos los eventos; pasarlo a events.extra_info si alguno necesita otro.
  select 5;
$$;

-- Quién puede dar tickets de actividad: staff del back-office con acceso al evento, o quien está
-- inscrito como speaker, sponsor o staff (rol dado por el cupón).
create or replace function public.can_award_tickets(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_event_access(p_event_id)
    or exists (
      select 1
      from public.registrations r
      where r.event_id = p_event_id
        and r.user_id = auth.uid()
        and r.status = 'CONFIRMED'
        and r.event_role in ('SPEAKER', 'SPONSOR', 'STAFF')
    );
$$;

-- Tickets válidos de un evento (o de una inscripción). Es la única definición: la usan la lista
-- del asistente y el sorteo, así nunca difieren. Si se borra la actividad o la otra inscripción,
-- ese ticket deja de contar.
create or replace function public.raffle_tickets(p_event_id uuid, p_registration_id uuid default null)
returns table (registration_id uuid, kind text, label text, scanned_at timestamptz, scanned_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.registration_id, 'checkin', 'Check-in', s.scanned_at, s.scanned_by
  from public.scan_logs s
  join public.registrations r on r.id = s.registration_id
  where r.event_id = p_event_id
    and (p_registration_id is null or r.id = p_registration_id)
    and s.scan_type = 'checkin'
  union all
  select s.registration_id, 'activity', a.name, s.scanned_at, s.scanned_by
  from public.scan_logs s
  join public.registrations r on r.id = s.registration_id
  join public.point_activities a on a.event_id = r.event_id and s.scan_type = 'pts:' || a.id
  where r.event_id = p_event_id
    and (p_registration_id is null or r.id = p_registration_id)
  union all
  select s.registration_id, 'networking',
         trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
         s.scanned_at, s.scanned_by
  from public.scan_logs s
  join public.registrations r on r.id = s.registration_id
  join public.registrations other on other.event_id = r.event_id and s.scan_type = 'net:' || other.id
  left join public.users u on u.id = other.user_id
  where r.event_id = p_event_id
    and (p_registration_id is null or r.id = p_registration_id);
$$;

-- 5. Escanear un QR para dar tickets --------------------------------------------------------------
-- p_activity_id: ticket de esa actividad para la persona escaneada (solo can_award_tickets).
-- Sin actividad: networking, 1 ticket para cada uno mientras no pase el tope.
-- El nombre de la persona escaneada solo se devuelve a quien tiene permiso para escanearla.

create or replace function public.scan_ticket(
  p_event_id uuid,
  p_registration_id uuid,
  p_activity_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap          int := public.networking_ticket_cap();
  v_target       public.registrations%rowtype;
  v_mine         public.registrations%rowtype;
  v_name         text;
  v_mine_net     int;
  v_their_net    int;
  v_mine_added   boolean := false;
  v_theirs_added boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para escanear.' using errcode = '42501';
  end if;

  -- Un QR de otro evento (p. ej. una entrada vieja) no cuenta en este.
  select * into v_target
  from public.registrations
  where id = p_registration_id and event_id = p_event_id and status = 'CONFIRMED';
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_activity_id is not null then
    if not public.can_award_tickets(p_event_id) then
      return jsonb_build_object('status', 'forbidden');
    end if;
    if not exists (
      select 1 from public.point_activities a
      where a.id = p_activity_id and a.event_id = p_event_id
    ) then
      return jsonb_build_object('status', 'invalid_activity');
    end if;
    -- Quien da tickets y además está inscrito como asistente no puede dárselos a sí mismo.
    if v_target.user_id = auth.uid() then
      return jsonb_build_object('status', 'self');
    end if;

    v_name := (select trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
               from public.users u where u.id = v_target.user_id);

    -- Sin check-in no hay ticket: además, cualquier fila de scan_logs cuenta como asistencia
    -- para el certificado.
    if not exists (
      select 1 from public.scan_logs where registration_id = v_target.id and scan_type = 'checkin'
    ) then
      return jsonb_build_object('status', 'not_checked_in', 'name', v_name);
    end if;

    insert into public.scan_logs (registration_id, scan_type, scanned_by)
    values (v_target.id, 'pts:' || p_activity_id, auth.uid())
    on conflict (registration_id, scan_type) do nothing;

    return jsonb_build_object('status', case when found then 'ok' else 'already' end, 'name', v_name);
  end if;

  select * into v_mine
  from public.registrations
  where event_id = p_event_id and user_id = auth.uid() and status = 'CONFIRMED';
  if not found then
    return jsonb_build_object('status', 'not_registered');
  end if;
  if v_mine.id = v_target.id then
    return jsonb_build_object('status', 'self');
  end if;

  v_name := (select trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
             from public.users u where u.id = v_target.user_id);

  -- Bloquea ambas inscripciones en orden fijo: dos personas escaneándose a la vez no se trancan
  -- y el tope se cuenta sin carreras. NO KEY UPDATE no frena los check-in (FK) de la puerta.
  perform 1 from public.registrations where id in (v_mine.id, v_target.id) order by id for no key update;

  if not exists (select 1 from public.scan_logs where registration_id = v_mine.id and scan_type = 'checkin')
     or not exists (select 1 from public.scan_logs where registration_id = v_target.id and scan_type = 'checkin') then
    return jsonb_build_object('status', 'not_checked_in', 'name', v_name);
  end if;

  if exists (
    select 1 from public.scan_logs
    where (registration_id = v_mine.id and scan_type = 'net:' || v_target.id)
       or (registration_id = v_target.id and scan_type = 'net:' || v_mine.id)
  ) then
    return jsonb_build_object('status', 'already', 'name', v_name);
  end if;

  -- El tope cuenta lo mismo que ve cada asistente en su lista.
  select count(*) into v_mine_net
  from public.raffle_tickets(p_event_id, v_mine.id) t where t.kind = 'networking';
  select count(*) into v_their_net
  from public.raffle_tickets(p_event_id, v_target.id) t where t.kind = 'networking';

  if v_mine_net < v_cap then
    insert into public.scan_logs (registration_id, scan_type, scanned_by)
    values (v_mine.id, 'net:' || v_target.id, auth.uid());
    v_mine_added := true;
    v_mine_net := v_mine_net + 1;
  end if;
  if v_their_net < v_cap then
    insert into public.scan_logs (registration_id, scan_type, scanned_by)
    values (v_target.id, 'net:' || v_mine.id, auth.uid());
    v_theirs_added := true;
  end if;

  return jsonb_build_object(
    'status', case when v_mine_added or v_theirs_added then 'ok' else 'limit' end,
    'name', v_name,
    'mine_added', v_mine_added,
    'theirs_added', v_theirs_added,
    'my_net', v_mine_net,
    'net_cap', v_cap
  );
end;
$$;

-- 6. Mis tickets ----------------------------------------------------------------------------------
-- Lo que ve cada asistente: sus tickets con el motivo (los últimos primero), y si puede escanear
-- para dar actividades.

create or replace function public.my_tickets(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.id, r.event_role
    from public.registrations r
    where r.event_id = p_event_id and r.user_id = auth.uid() and r.status = 'CONFIRMED'
  ),
  t as (
    select rt.*
    from mine m
    cross join lateral public.raffle_tickets(p_event_id, m.id) rt
  )
  select jsonb_build_object(
    'registration_id', (select id from mine),
    'event_role', (select event_role from mine),
    'checked_in', exists (select 1 from t where t.kind = 'checkin'),
    'can_award', public.can_award_tickets(p_event_id),
    'net_count', (select count(*) from t where t.kind = 'networking'),
    'net_cap', public.networking_ticket_cap(),
    'tickets', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'kind', t.kind,
           'label', t.label,
           'at', t.scanned_at,
           'by_me', coalesce(t.scanned_by = auth.uid(), false))
         order by t.scanned_at desc)
       from t),
      '[]'::jsonb)
  );
$$;

-- 7. Sorteo ---------------------------------------------------------------------------------------
-- Entra quien está CONFIRMED, con rol ATTENDEE, cuenta activa, hizo check-in y todavía no ganó.

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
      and r.event_role = 'ATTENDEE'
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

-- 8. Certificado público sin correo ---------------------------------------------------------------
-- El QR (id de inscripción) ahora lo ven sponsors y otros asistentes, y esta RPC es pública (anon):
-- devolvía el correo de cualquier inscrito. La web no lo muestra; se devuelve null y la firma
-- queda igual para no romper clientes desplegados.

create or replace function public.get_public_certificate (
  p_registration_id uuid
)
  returns table (
    registration_id  uuid,
    event_id         uuid,
    event_title      character varying,
    event_slug       character varying,
    event_banner_url text,
    event_date_start timestamp with time zone,
    event_date_end   timestamp with time zone,
    event_role       character varying,
    ticket_name      character varying,
    check_in_date    timestamp with time zone,
    user_first_name  character varying,
    user_last_name   character varying,
    user_email       character varying,
    user_id          uuid
  )
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
begin
  -- Validamos de forma estricta que la inscripción cuente con registro de asistencia (check-in)
  -- Calificamos scan_logs.registration_id para evitar conflictos con la columna de retorno
  if not exists (
    select 1 from public.scan_logs sl
    where sl.registration_id = p_registration_id
  ) then
    return;
  end if;

  return query
  select
    r.id as registration_id,
    r.event_id,
    e.title as event_title,
    e.slug as event_slug,
    e.banner_url as event_banner_url,
    e.date_start as event_date_start,
    e.date_end as event_date_end,
    r.event_role as event_role,
    t.name as ticket_name,
    coalesce(s.scanned_at, r.created_at) as check_in_date,
    u.first_name as user_first_name,
    u.last_name as user_last_name,
    null::character varying as user_email,
    r.user_id
  from public.registrations r
  inner join public.events e on e.id = r.event_id
  left join public.ticket_types t on t.id = r.ticket_type_id
  left join public.users u on u.id = r.user_id
  left join lateral (
    select sl_lat.scanned_at from public.scan_logs sl_lat
    where sl_lat.registration_id = r.id
    order by sl_lat.scanned_at asc
    limit 1
  ) s on true
  where r.id = p_registration_id;
end;
$function$;

-- 9. Permisos -------------------------------------------------------------------------------------

revoke all on function public.can_award_tickets(uuid) from public, anon, authenticated;
revoke all on function public.raffle_tickets(uuid, uuid) from public, anon, authenticated;
revoke all on function public.scan_ticket(uuid, uuid, uuid) from public, anon;
revoke all on function public.my_tickets(uuid) from public, anon;
revoke all on function public.draw_raffle(uuid, text) from public, anon;

grant execute on function public.scan_ticket(uuid, uuid, uuid) to authenticated;
grant execute on function public.my_tickets(uuid) to authenticated;
grant execute on function public.draw_raffle(uuid, text) to authenticated;
