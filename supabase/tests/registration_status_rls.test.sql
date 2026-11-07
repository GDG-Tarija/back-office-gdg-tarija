-- Issue #7: estados de inscripción, RLS y bloqueo de asistencia para inscripciones anuladas.
--
-- Corre contra el Supabase LOCAL: `npm run db:test` (o `npx supabase test db`).
-- Todo pasa dentro de una transacción con ROLLBACK: no deja datos ni cambia la base local.
-- Los datos son ficticios y propios de esta prueba (no dependen del seed ni de tus datos locales).
-- Cada bloque cambia de rol con `set local role` + `request.jwt.claims`, igual que PostgREST,
-- así que las policies RLS se evalúan de verdad (nada corre como postgres salvo el fixture).

begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

-- ---------------------------------------------------------------------------
-- Fixture (como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'superadmin@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'staff@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'staff-otro@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'user1@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'user2@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'user3@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b4', 'authenticated', 'authenticated', 'user4@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b5', 'authenticated', 'authenticated', 'user5@rls-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b6', 'authenticated', 'authenticated', 'user6@rls-test.test');

insert into public.staff_whitelist (email, role) values
  ('superadmin@rls-test.test', 'SUPERADMIN'),
  ('staff@rls-test.test',      'STAFF'),
  ('staff-otro@rls-test.test', 'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('7e570000-0000-4000-8000-0000000000e1', 'Evento RLS test', 'evento-rls-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('7e570000-0000-4000-8000-0000000000f1', '7e570000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

-- staff@ asignado al evento; staff-otro@ no.
insert into public.event_staff_assignments (event_id, staff_email)
values ('7e570000-0000-4000-8000-0000000000e1', 'staff@rls-test.test');

insert into public.registrations (id, event_id, user_id, ticket_type_id, status, custom_responses) values
  ('7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b1', '7e570000-0000-4000-8000-0000000000f1', 'PENDING',   '{"talla": "M"}'),
  ('7e570000-0000-4000-8000-000000000102', '7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b2', '7e570000-0000-4000-8000-0000000000f1', 'CONFIRMED', '{}'),
  ('7e570000-0000-4000-8000-000000000103', '7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b3', '7e570000-0000-4000-8000-0000000000f1', 'CANCELLED', '{}'),
  ('7e570000-0000-4000-8000-000000000104', '7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b4', '7e570000-0000-4000-8000-0000000000f1', 'PENDING',   '{}'),
  ('7e570000-0000-4000-8000-000000000105', '7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b5', '7e570000-0000-4000-8000-0000000000f1', 'CONFIRMED', '{}');

-- ---------------------------------------------------------------------------
-- 1. Anónimo
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select is_empty(
  $$ update public.registrations set status = 'CONFIRMED'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'anon: no puede cambiar el estado de una inscripción');
select is_empty(
  $$ select id from public.registrations where event_id = '7e570000-0000-4000-8000-0000000000e1' $$,
  'anon: no lee inscripciones');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000102', 'checkin') $$,
  '42501', null,
  'anon: no puede registrar asistencia');

reset role;

-- ---------------------------------------------------------------------------
-- 2. Autenticado sin rol (dueño de la inscripción ...101)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000b1", "role": "authenticated"}';

select is_empty(
  $$ update public.registrations set status = 'CONFIRMED'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'usuario sin rol: no puede confirmar su propia inscripción');
select is_empty(
  $$ update public.registrations set payment_proof_url = 'https://ejemplo.test/x.png', custom_responses = '{}'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'usuario sin rol: no puede cambiar otros campos de su inscripción');
select isnt_empty(
  $$ select id from public.registrations where id = '7e570000-0000-4000-8000-000000000101' $$,
  'usuario sin rol: sigue leyendo su propia inscripción');
select is_empty(
  $$ select id from public.registrations where id = '7e570000-0000-4000-8000-000000000102' $$,
  'usuario sin rol: no lee inscripciones ajenas');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000101', 'checkin') $$,
  '42501', null,
  'usuario sin rol: no puede registrar asistencia');

reset role;

-- Registro público intacto: un usuario sin inscripción se inscribe a sí mismo, no a otros.
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000b6", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.registrations (event_id, user_id, ticket_type_id, status)
     values ('7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b6',
             '7e570000-0000-4000-8000-0000000000f1', 'PENDING') $$,
  'registro público: un usuario puede crear su propia inscripción');
select throws_ok(
  $$ insert into public.registrations (event_id, user_id, ticket_type_id, status)
     values ('7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000a3',
             '7e570000-0000-4000-8000-0000000000f1', 'PENDING') $$,
  '42501', null,
  'registro público: no puede crear inscripciones a nombre de otro');

reset role;

-- ---------------------------------------------------------------------------
-- 3. STAFF asignado al evento
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select is(public.get_my_role(), 'STAFF', 'STAFF: get_my_role() resuelve STAFF');
select isnt_empty(
  $$ select id from public.registrations where event_id = '7e570000-0000-4000-8000-0000000000e1' $$,
  'STAFF: lee las inscripciones del evento asignado');
select is_empty(
  $$ update public.registrations set status = 'CONFIRMED'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'STAFF: no puede marcar como pagada');
select is_empty(
  $$ update public.registrations set status = 'CANCELLED'
     where id = '7e570000-0000-4000-8000-000000000102' returning id $$,
  'STAFF: no puede anular');
select is_empty(
  $$ update public.registrations set custom_responses = '{"x": 1}', event_role = 'SPEAKER'
     where id = '7e570000-0000-4000-8000-000000000102' returning id $$,
  'STAFF: no puede cambiar otros campos');

reset role;

select results_eq(
  $$ select status::text from public.registrations
     where id in ('7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-000000000102')
     order by id $$,
  $$ values ('PENDING'::text), ('CONFIRMED'::text) $$,
  'los intentos rechazados (anon, sin rol, STAFF) no cambiaron ningún estado');

-- ---------------------------------------------------------------------------
-- 4. SUPERADMIN: transiciones de estado
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select ok(public.is_superadmin(), 'SUPERADMIN: is_superadmin() es true');

select isnt_empty(
  $$ update public.registrations set status = 'CONFIRMED'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'SUPERADMIN: PENDING -> CONFIRMED');
select is(
  (select status::text from public.registrations where id = '7e570000-0000-4000-8000-000000000101'),
  'CONFIRMED', 'SUPERADMIN: quedó CONFIRMED');

select isnt_empty(
  $$ update public.registrations set status = 'PENDING'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'SUPERADMIN: CONFIRMED -> PENDING');
select is(
  (select status::text from public.registrations where id = '7e570000-0000-4000-8000-000000000101'),
  'PENDING', 'SUPERADMIN: quedó PENDING');

select isnt_empty(
  $$ update public.registrations set status = 'CANCELLED'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'SUPERADMIN: PENDING -> CANCELLED');
select isnt_empty(
  $$ update public.registrations set status = 'CONFIRMED'
     where id = '7e570000-0000-4000-8000-000000000101' returning id $$,
  'SUPERADMIN: restaurar CANCELLED -> CONFIRMED');

select throws_ok(
  $$ update public.registrations set status = 'PAID'
     where id = '7e570000-0000-4000-8000-000000000101' $$,
  '23514', null,
  'SUPERADMIN: un estado fuera del CHECK se rechaza');
select throws_ok(
  $$ update public.registrations set status = 'confirmed'
     where id = '7e570000-0000-4000-8000-000000000101' $$,
  '23514', null,
  'SUPERADMIN: el CHECK distingue mayúsculas (solo PENDING/CONFIRMED/CANCELLED)');

reset role;

select results_eq(
  $$ select status::text, custom_responses, ticket_type_id, event_role::text, user_id
     from public.registrations where id = '7e570000-0000-4000-8000-000000000101' $$,
  $$ values ('CONFIRMED'::text, '{"talla": "M"}'::jsonb, '7e570000-0000-4000-8000-0000000000f1'::uuid,
             'ATTENDEE'::text, '7e570000-0000-4000-8000-0000000000b1'::uuid) $$,
  'cambiar el estado no toca los demás campos de la inscripción');

-- ---------------------------------------------------------------------------
-- 5. Asistencia: CANCELLED bloqueado en todos los tipos de escaneo
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000103', 'checkin') $$,
  'P0001', 'La inscripción está anulada: no se puede registrar asistencia.',
  'STAFF: CANCELLED no puede hacer check-in');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000103', 'refrigerio') $$,
  'P0001', null,
  'STAFF: CANCELLED no puede recibir refrigerio');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000103', 'session_entry:d3d3d3d3-0000-40') $$,
  'P0001', null,
  'STAFF: CANCELLED no puede ingresar a una sesión (session_entry)');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000103', 'session') $$,
  'P0001', null,
  'STAFF: CANCELLED no puede registrar scan_type session');

-- CONFIRMED sigue funcionando y los duplicados siguen rechazados.
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000102', 'checkin') $$,
  'STAFF: CONFIRMED hace check-in');
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000102', 'refrigerio') $$,
  'STAFF: CONFIRMED recibe refrigerio');
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000102', 'session_entry:d3d3d3d3-0000-40') $$,
  'STAFF: CONFIRMED ingresa a una sesión');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000102', 'checkin') $$,
  '23505', null,
  'STAFF: un check-in duplicado sigue rechazado (unique_registration_scan_type)');

-- PENDING: la base no lo bloquea (el QR exige CONFIRMED en la app; ver CheckinApi).
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000104', 'checkin') $$,
  'STAFF: PENDING no está bloqueado por la base (sigue las reglas actuales de cada flujo)');

-- Historial: check-in previo, luego se anula.
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000105', 'checkin') $$,
  'STAFF: check-in de ...105 mientras está CONFIRMED');

reset role;

-- STAFF no asignado: RLS de siempre.
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000105', 'refrigerio') $$,
  '42501', null,
  'STAFF no asignado: sigue sin poder registrar asistencia');

reset role;

-- SUPERADMIN tampoco puede registrar asistencia de una anulada; anular conserva el historial.
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000103', 'checkin') $$,
  'P0001', null,
  'SUPERADMIN: CANCELLED tampoco puede hacer check-in');
select isnt_empty(
  $$ update public.registrations set status = 'CANCELLED'
     where id = '7e570000-0000-4000-8000-000000000105' returning id $$,
  'SUPERADMIN: anula ...105 (que ya tenía check-in)');

reset role;

select is(
  (select count(*) from public.scan_logs where registration_id = '7e570000-0000-4000-8000-000000000105'),
  1::bigint,
  'anular no borra el check-in histórico');

set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000105', 'refrigerio') $$,
  'P0001', null,
  'STAFF: tras anular, ...105 ya no recibe refrigerio');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ update public.registrations set status = 'CONFIRMED'
     where id = '7e570000-0000-4000-8000-000000000105' returning id $$,
  'SUPERADMIN: restaura ...105 a CONFIRMED');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type)
     values ('7e570000-0000-4000-8000-000000000105', 'refrigerio') $$,
  'STAFF: restaurada, ...105 vuelve a poder registrar asistencia');
reset role;

-- Mover un scan existente a una inscripción anulada también se rechaza (aun como postgres).
select throws_ok(
  $$ update public.scan_logs set registration_id = '7e570000-0000-4000-8000-000000000103'
     where registration_id = '7e570000-0000-4000-8000-000000000102' and scan_type = 'checkin' $$,
  'P0001', null,
  'no se puede reasignar un scan a una inscripción anulada');

select * from finish();

rollback;
