-- Usuarios del back-office: RPCs de gestión (solo SUPERADMIN), reglas y acceso por evento.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con ROLLBACK y
-- con datos ficticios propios. Cada bloque actúa como un usuario real (`set local role` + claims).
--
-- "Debe quedar al menos un superadministrador" (P0023) no se puede provocar desde una sola sesión:
-- quien llama es SUPERADMIN y no puede actuar sobre sí mismo, así que siempre queda él. La regla
-- protege el caso de dos superadmins quitándose entre sí al mismo tiempo (filas bloqueadas FOR UPDATE).

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000003a1', 'authenticated', 'authenticated', 'admin@users-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000003a2', 'authenticated', 'authenticated', 'admin2@users-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000003a3', 'authenticated', 'authenticated', 'puerta@users-test.test');

insert into public.staff_whitelist (email, role) values
  ('admin@users-test.test',  'SUPERADMIN'),
  ('admin2@users-test.test', 'SUPERADMIN'),
  ('PUERTA@Users-Test.test', 'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('7e570000-0000-4000-8000-0000000003e1', 'Evento usuarios test', 'evento-usuarios-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.event_staff_assignments (event_id, staff_email)
values ('7e570000-0000-4000-8000-0000000003e1', 'Puerta@users-test.test');

-- ---------------------------------------------------------------------------
-- Correos normalizados y asignaciones atadas al acceso
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from public.staff_whitelist where email = 'puerta@users-test.test'),
  'el correo del back-office se guarda en minúsculas'
);
select ok(
  exists (select 1 from public.event_staff_assignments where staff_email = 'puerta@users-test.test'),
  'el correo de la asignación se guarda en minúsculas'
);
select throws_ok(
  $$ insert into public.event_staff_assignments (event_id, staff_email)
     values ('7e570000-0000-4000-8000-0000000003e1', 'sin-acceso@users-test.test') $$,
  '23503',
  null,
  'no se puede asignar a un evento un correo sin acceso al back-office'
);

-- ---------------------------------------------------------------------------
-- Anónimo y STAFF no gestionan usuarios
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok($$ select * from public.list_backoffice_users() $$, '42501', null,
  'anónimo: no puede listar usuarios');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000003a3", "role": "authenticated", "email": "puerta@users-test.test"}';
select ok(public.has_event_access('7e570000-0000-4000-8000-0000000003e1'),
  'STAFF asignado: tiene acceso al evento');
select throws_ok($$ select * from public.list_backoffice_users() $$, '42501', null,
  'STAFF: no puede listar usuarios');
select throws_ok($$ select public.add_backoffice_user('nuevo@users-test.test', 'STAFF') $$, '42501', null,
  'STAFF: no puede agregar usuarios');
reset role;

-- ---------------------------------------------------------------------------
-- SUPERADMIN
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000003a1", "role": "authenticated", "email": "admin@users-test.test"}';

select is(
  (select jsonb_array_length(assigned_events) from public.list_backoffice_users()
    where email = 'puerta@users-test.test'),
  1,
  'SUPERADMIN: ve los eventos asignados de cada STAFF'
);
select ok(
  (select last_sign_in_at is null and user_id is not null from public.list_backoffice_users()
    where email = 'admin2@users-test.test'),
  'SUPERADMIN: ve quién todavía no entró nunca'
);

select throws_ok($$ select public.add_backoffice_user('no-es-correo', 'STAFF') $$, 'P0020', null,
  'agregar: rechaza un correo no válido');
select throws_ok($$ select public.add_backoffice_user('nuevo@users-test.test', 'ADMIN') $$, 'P0020', null,
  'agregar: rechaza un rol que no existe');
select throws_ok($$ select public.add_backoffice_user('  Puerta@USERS-test.test ', 'STAFF') $$, 'P0021', null,
  'agregar: rechaza un correo que ya tiene acceso (sin importar mayúsculas)');
select lives_ok($$ select public.add_backoffice_user(' Nuevo@Users-Test.test ', 'STAFF') $$,
  'agregar: da de alta un correo nuevo');
select is(
  (select role from public.list_backoffice_users() where email = 'nuevo@users-test.test'),
  'STAFF',
  'agregar: queda en minúsculas con el rol elegido'
);

select throws_ok($$ select public.set_backoffice_user_role('admin@users-test.test', 'STAFF') $$, 'P0022', null,
  'rol: no puede cambiar su propio rol');
select throws_ok($$ select public.set_backoffice_user_role('nadie@users-test.test', 'STAFF') $$, 'P0024', null,
  'rol: avisa si el correo no tiene acceso');
select lives_ok($$ select public.set_backoffice_user_role('admin2@users-test.test', 'STAFF') $$,
  'rol: pasa a otro superadmin a STAFF');

select throws_ok($$ select public.remove_backoffice_user('admin@users-test.test') $$, 'P0022', null,
  'quitar: no puede quitarse el acceso a sí mismo');
select lives_ok($$ select public.remove_backoffice_user('puerta@users-test.test') $$,
  'quitar: quita el acceso de un STAFF');
reset role;

select ok(
  not exists (select 1 from public.event_staff_assignments where staff_email = 'puerta@users-test.test'),
  'quitar el acceso borra sus asignaciones a eventos'
);
select is(
  (select actor_id::text || '|' || actor_role from public.audit_log
    where table_name = 'staff_whitelist' and action = 'DELETE'
      and changes ->> 'email' = 'puerta@users-test.test'),
  '7e570000-0000-4000-8000-0000000003a1|SUPERADMIN',
  'la auditoría registra quién quitó el acceso'
);

-- El STAFF quitado ya no tiene acceso al evento.
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000003a3", "role": "authenticated", "email": "puerta@users-test.test"}';
select ok(not public.has_event_access('7e570000-0000-4000-8000-0000000003e1'),
  'STAFF quitado: pierde el acceso al evento');
reset role;

select * from finish();
rollback;
