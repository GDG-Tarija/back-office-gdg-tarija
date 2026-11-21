-- Usuarios del back-office (pantalla /users) y auditoría de quién hizo qué.
--
-- 1. Correos de staff_whitelist / event_staff_assignments siempre en minúsculas.
-- 2. Asignar a un evento exige tener acceso al back-office (FK a staff_whitelist.email). Quitar el
--    acceso borra sus asignaciones (ON DELETE CASCADE): antes, una asignación sin whitelist seguía
--    dando acceso por RLS vía has_event_access(). En prod hay 0 asignaciones (verificado 2026-11-15).
-- 3. get_my_role() y has_event_access() comparan correos sin distinguir mayúsculas.
-- 4. audit_log: registro solo-agregar de altas, cambios y bajas en las tablas que opera el
--    back-office (y las inscripciones que crea la web pública). Lo escribe un trigger SECURITY
--    DEFINER; nadie lo modifica desde la app. Lo lee solo SUPERADMIN.
-- 5. Backfill: altas de inscripciones y escaneos que ya existían (source = 'backfill'). Los cambios
--    de estado anteriores a esta migración no se pueden reconstruir.
-- 6. RPCs para gestionar usuarios del back-office (solo SUPERADMIN). staff_whitelist sigue sin
--    policies de escritura: todo cambio pasa por estas funciones, que aplican las reglas.
--
-- El rol del back-office (staff_whitelist.role) NO tiene relación con el rol de la persona en el
-- evento (registrations.event_role, que da el cupón): un "Staff" por cupón no entra al panel.

-- 1. Correos en minúsculas ---------------------------------------------------------------------

update public.staff_whitelist
   set email = lower(trim(email))
 where email <> lower(trim(email));

update public.event_staff_assignments
   set staff_email = lower(trim(staff_email))
 where staff_email <> lower(trim(staff_email));

create or replace function public.normalize_staff_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'staff_whitelist' then
    new.email := lower(trim(new.email));
  else
    new.staff_email := lower(trim(new.staff_email));
  end if;
  return new;
end;
$$;

create trigger trg_normalize_staff_email
  before insert or update of email on public.staff_whitelist
  for each row execute function public.normalize_staff_email();

create trigger trg_normalize_staff_email
  before insert or update of staff_email on public.event_staff_assignments
  for each row execute function public.normalize_staff_email();

-- 2. Asignar a un evento exige acceso al back-office --------------------------------------------

-- Asignaciones a correos sin acceso no servían para entrar al panel; se descartan (prod: 0).
delete from public.event_staff_assignments esa
 where not exists (select 1 from public.staff_whitelist sw where sw.email = esa.staff_email);

alter table public.event_staff_assignments
  add constraint event_staff_assignments_staff_email_fkey
  foreign key (staff_email) references public.staff_whitelist (email)
  on update cascade on delete cascade;

-- 3. Rol y acceso por evento sin distinguir mayúsculas -----------------------------------------

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select sw.role
  from public.staff_whitelist sw
  join auth.users au on lower(au.email) = sw.email
  where au.id = auth.uid()
  limit 1;
$$;

create or replace function public.has_event_access(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or exists (
      select 1
      from public.event_staff_assignments esa
      join public.staff_whitelist sw on sw.email = esa.staff_email
      join auth.users au on lower(au.email) = esa.staff_email
      where au.id = auth.uid()
        and esa.event_id = p_event_id
    );
$$;

-- 4. Auditoría -----------------------------------------------------------------------------------

create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  actor_role  text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name  text not null,
  record_id   text,
  event_id    uuid,
  changes     jsonb not null default '{}'::jsonb,
  source      text not null default 'app' check (source in ('app', 'backfill'))
);

comment on table public.audit_log is
  'Quién hizo qué: una fila por alta/cambio/baja en las tablas auditadas. Solo agregar; lo escribe audit_row_change().';
comment on column public.audit_log.actor_id is
  'auth.uid() de quien hizo el cambio; null = Sistema (consola, migración o service role).';
comment on column public.audit_log.actor_role is
  'Rol del back-office al momento del cambio (SUPERADMIN/STAFF); null = persona sin acceso (p. ej. inscripción desde la web).';
comment on column public.audit_log.changes is
  'INSERT/DELETE: la fila (sin created_at/updated_at). UPDATE: solo lo que cambió, {campo: [antes, después]}.';

create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_event_idx on public.audit_log (event_id, occurred_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);

alter table public.audit_log enable row level security;

create policy superadmin_read_audit_log on public.audit_log
  for select to authenticated
  using (public.is_superadmin());

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_event   uuid;
  v_claims  jsonb;
begin
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key in ('created_at', 'updated_at');
      if (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
      end if;
    end loop;
    -- Un UPDATE que solo tocó updated_at no es un cambio para nadie.
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  else
    v_changes := v_row - 'created_at' - 'updated_at';
  end if;

  v_event := case tg_table_name
    when 'events' then (v_row ->> 'id')::uuid
    when 'tracks' then (v_row ->> 'evento_id')::uuid
    when 'ticket_phases' then
      (select tt.event_id from public.ticket_types tt where tt.id = (v_row ->> 'ticket_type_id')::uuid)
    when 'scan_logs' then
      (select r.event_id from public.registrations r where r.id = (v_row ->> 'registration_id')::uuid)
    when 'session_registrations' then
      (select r.event_id from public.registrations r where r.id = (v_row ->> 'registration_id')::uuid)
    when 'staff_whitelist' then null
    else (v_row ->> 'event_id')::uuid
  end;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;

  insert into public.audit_log (actor_id, actor_email, actor_role, action, table_name, record_id, event_id, changes)
  values (
    auth.uid(),
    lower(v_claims ->> 'email'),
    case when auth.uid() is not null then public.get_my_role() end,
    tg_op,
    tg_table_name,
    -- session_registrations no tiene id: se agrupa bajo la inscripción.
    coalesce(v_row ->> 'id', v_row ->> 'registration_id'),
    v_event,
    v_changes
  );
  return null;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

create trigger trg_audit_row_change after insert or update or delete on public.staff_whitelist
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.event_staff_assignments
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.events
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.ticket_types
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.ticket_phases
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.event_coupons
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.tracks
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.sessions
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.registrations
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.scan_logs
  for each row execute function public.audit_row_change();
create trigger trg_audit_row_change after insert or update or delete on public.session_registrations
  for each row execute function public.audit_row_change();

-- 5. Backfill de lo que ya existía -------------------------------------------------------------

insert into public.audit_log
  (occurred_at, actor_id, actor_email, actor_role, action, table_name, record_id, event_id, changes, source)
select
  coalesce(r.created_at, now()),
  r.user_id,
  lower(au.email),
  null,
  'INSERT',
  'registrations',
  r.id::text,
  r.event_id,
  jsonb_build_object(
    'user_id', r.user_id,
    'ticket_type_id', r.ticket_type_id,
    'event_role', r.event_role,
    'coupon_id', r.coupon_id
  ),
  'backfill'
from public.registrations r
left join auth.users au on au.id = r.user_id;

insert into public.audit_log
  (occurred_at, actor_id, actor_email, actor_role, action, table_name, record_id, event_id, changes, source)
select
  coalesce(s.scanned_at, s.created_at, now()),
  s.scanned_by,
  lower(au.email),
  sw.role,
  'INSERT',
  'scan_logs',
  s.id::text,
  r.event_id,
  jsonb_build_object(
    'registration_id', s.registration_id,
    'scan_type', s.scan_type,
    'scanned_by', s.scanned_by,
    'scanned_at', s.scanned_at
  ),
  'backfill'
from public.scan_logs s
join public.registrations r on r.id = s.registration_id
left join auth.users au on au.id = s.scanned_by
left join public.staff_whitelist sw on sw.email = lower(au.email);

-- 6. Gestión de usuarios del back-office ---------------------------------------------------------
-- Errores de negocio con mensaje en español para la UI:
--   P0020 dato no válido · P0021 ya tiene acceso · P0022 sobre uno mismo
--   P0023 debe quedar un superadministrador · P0024 no tiene acceso

create or replace function public.require_superadmin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Solo un superadministrador puede gestionar los usuarios del back-office.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.list_backoffice_users()
returns table (
  email            text,
  role             text,
  user_id          uuid,
  first_name       text,
  last_name        text,
  avatar_url       text,
  last_sign_in_at  timestamptz,
  added_at         timestamptz,
  added_by_email   text,
  last_activity_at timestamptz,
  assigned_events  jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.require_superadmin();

  return query
  select
    sw.email::text,
    sw.role::text,
    au.id,
    u.first_name::text,
    u.last_name::text,
    u.avatar_url,
    au.last_sign_in_at,
    sw.created_at,
    (select a.actor_email
       from public.audit_log a
      where a.table_name = 'staff_whitelist' and a.action = 'INSERT' and a.record_id = sw.id::text
      order by a.occurred_at desc
      limit 1),
    (select max(a.occurred_at) from public.audit_log a where a.actor_id = au.id and a.source = 'app'),
    coalesce(
      (select jsonb_agg(
                 jsonb_build_object('assignment_id', esa.id, 'event_id', e.id, 'title', e.title, 'date_start', e.date_start)
                 order by e.date_start desc)
         from public.event_staff_assignments esa
         join public.events e on e.id = esa.event_id
        where esa.staff_email = sw.email),
      '[]'::jsonb
    )
  from public.staff_whitelist sw
  left join auth.users au on lower(au.email) = sw.email
  left join public.users u on u.id = au.id
  order by sw.role = 'SUPERADMIN' desc, sw.email;
end;
$$;

create or replace function public.add_backoffice_user(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform public.require_superadmin();

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Escribe un correo válido.' using errcode = 'P0020';
  end if;
  if p_role is null or p_role not in ('SUPERADMIN', 'STAFF') then
    raise exception 'Elige un rol válido.' using errcode = 'P0020';
  end if;
  if exists (select 1 from public.staff_whitelist sw where sw.email = v_email) then
    raise exception 'Ese correo ya tiene acceso al back-office.' using errcode = 'P0021';
  end if;

  insert into public.staff_whitelist (email, role) values (v_email, p_role);
end;
$$;

create or replace function public.set_backoffice_user_role(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_current text;
begin
  perform public.require_superadmin();

  if p_role is null or p_role not in ('SUPERADMIN', 'STAFF') then
    raise exception 'Elige un rol válido.' using errcode = 'P0020';
  end if;

  -- Bloquea a los superadmins: dos cambios a la vez no pueden dejar el panel sin ninguno.
  perform 1 from public.staff_whitelist sw where sw.role = 'SUPERADMIN' for update;

  select sw.role into v_current from public.staff_whitelist sw where sw.email = v_email;
  if not found then
    raise exception 'Ese correo no tiene acceso al back-office.' using errcode = 'P0024';
  end if;
  if v_email = (select lower(au.email) from auth.users au where au.id = auth.uid()) then
    raise exception 'No puedes cambiar tu propio rol.' using errcode = 'P0022';
  end if;
  if v_current = p_role then
    return;
  end if;
  if v_current = 'SUPERADMIN'
     and (select count(*) from public.staff_whitelist sw where sw.role = 'SUPERADMIN') <= 1 then
    raise exception 'Debe quedar al menos un superadministrador.' using errcode = 'P0023';
  end if;

  update public.staff_whitelist sw set role = p_role where sw.email = v_email;
end;
$$;

create or replace function public.remove_backoffice_user(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_current text;
begin
  perform public.require_superadmin();

  perform 1 from public.staff_whitelist sw where sw.role = 'SUPERADMIN' for update;

  select sw.role into v_current from public.staff_whitelist sw where sw.email = v_email;
  if not found then
    raise exception 'Ese correo no tiene acceso al back-office.' using errcode = 'P0024';
  end if;
  if v_email = (select lower(au.email) from auth.users au where au.id = auth.uid()) then
    raise exception 'No puedes quitarte el acceso a ti mismo.' using errcode = 'P0022';
  end if;
  if v_current = 'SUPERADMIN'
     and (select count(*) from public.staff_whitelist sw where sw.role = 'SUPERADMIN') <= 1 then
    raise exception 'Debe quedar al menos un superadministrador.' using errcode = 'P0023';
  end if;

  -- ON DELETE CASCADE también quita sus asignaciones a eventos.
  delete from public.staff_whitelist sw where sw.email = v_email;
end;
$$;

revoke all on function public.require_superadmin() from public, anon;
revoke all on function public.list_backoffice_users() from public, anon;
revoke all on function public.add_backoffice_user(text, text) from public, anon;
revoke all on function public.set_backoffice_user_role(text, text) from public, anon;
revoke all on function public.remove_backoffice_user(text) from public, anon;

grant execute on function public.require_superadmin() to authenticated;
grant execute on function public.list_backoffice_users() to authenticated;
grant execute on function public.add_backoffice_user(text, text) to authenticated;
grant execute on function public.set_backoffice_user_role(text, text) to authenticated;
grant execute on function public.remove_backoffice_user(text) to authenticated;
