-- Check-in móvil: policy DELETE de scan_logs ("Deshacer" durante 60 s).
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'superadmin@undo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'staff@undo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'staff-otro@undo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'user1@undo-test.test');

insert into public.staff_whitelist (email, role) values
  ('superadmin@undo-test.test', 'SUPERADMIN'),
  ('staff@undo-test.test',      'STAFF'),
  ('staff-otro@undo-test.test', 'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('7e570000-0000-4000-8000-0000000000e1', 'Evento undo test', 'evento-undo-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('7e570000-0000-4000-8000-0000000000f1', '7e570000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

insert into public.event_staff_assignments (event_id, staff_email)
values ('7e570000-0000-4000-8000-0000000000e1', 'staff@undo-test.test');

insert into public.registrations (id, event_id, user_id, ticket_type_id, status) values
  ('7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-0000000000e1', '7e570000-0000-4000-8000-0000000000b1', '7e570000-0000-4000-8000-0000000000f1', 'CONFIRMED');

-- Escaneos: uno reciente de staff@, uno de staff@ de hace 2 min, uno reciente del superadmin,
-- y uno reciente de staff@ para probar a anon.
insert into public.scan_logs (id, registration_id, scanned_by, scan_type, scanned_at) values
  ('7e570000-0000-4000-8000-000000000201', '7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-0000000000a2', 'checkin',    now()),
  ('7e570000-0000-4000-8000-000000000202', '7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-0000000000a2', 'refrigerio', now() - interval '2 minutes'),
  ('7e570000-0000-4000-8000-000000000203', '7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-0000000000a1', 'session',    now()),
  ('7e570000-0000-4000-8000-000000000204', '7e570000-0000-4000-8000-000000000101', '7e570000-0000-4000-8000-0000000000a2', 'session_entry:x', now());

-- anon
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select is_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000204' returning id $$,
  'anon: no puede borrar escaneos');
reset role;

-- STAFF de otro evento (sin asignación)
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000201' returning id $$,
  'STAFF sin asignación: no borra escaneos de un evento ajeno');
reset role;

-- STAFF asignado
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000203' returning id $$,
  'STAFF: no borra un escaneo hecho por otro operador');
select is_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000202' returning id $$,
  'STAFF: no borra un escaneo de hace más de 60 s');
select isnt_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000201' returning id $$,
  'STAFF: borra su propio escaneo reciente');
reset role;

-- Usuario sin rol
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select is_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000204' returning id $$,
  'usuario sin rol: no borra escaneos');
reset role;

-- SUPERADMIN: propio y reciente sí; el de otro no.
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000203' returning id $$,
  'SUPERADMIN: borra su propio escaneo reciente');
select is_empty(
  $$ delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000204' returning id $$,
  'SUPERADMIN: no borra el escaneo de otro operador');
reset role;

select * from finish();
rollback;
