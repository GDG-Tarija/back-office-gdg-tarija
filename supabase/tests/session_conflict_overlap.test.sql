-- Choque de horario entre sesiones (trigger check_session_datetime_conflict).
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '5e550000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'user1@overlap-test.test');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('5e550000-0000-4000-8000-0000000000e1', 'Evento overlap test', 'evento-overlap-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('5e550000-0000-4000-8000-0000000000f1', '5e550000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

insert into public.registrations (id, event_id, user_id, ticket_type_id, status)
values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-0000000000e1', '5e550000-0000-4000-8000-0000000000b1', '5e550000-0000-4000-8000-0000000000f1', 'CONFIRMED');

-- Escenario DevFest: hackathon de 2 h, un codelab que empieza a la mitad, uno que empieza
-- justo al terminar, uno a la misma hora de inicio, y uno sin hora de fin.
insert into public.sessions (id, event_id, title, capacity, date, start_time, end_time) values
  ('5e550000-0000-4000-8000-000000000201', '5e550000-0000-4000-8000-0000000000e1', 'Hackathon',     30, '2026-11-20', '09:00', '11:00'),
  ('5e550000-0000-4000-8000-000000000202', '5e550000-0000-4000-8000-0000000000e1', 'Codelab 10:00', 30, '2026-11-20', '10:00', '11:00'),
  ('5e550000-0000-4000-8000-000000000203', '5e550000-0000-4000-8000-0000000000e1', 'Zen 11:00',     30, '2026-11-20', '11:00', '12:00'),
  ('5e550000-0000-4000-8000-000000000204', '5e550000-0000-4000-8000-0000000000e1', 'Codelab 09:00', 30, '2026-11-20', '09:00', '10:00'),
  ('5e550000-0000-4000-8000-000000000205', '5e550000-0000-4000-8000-0000000000e1', 'Sin fin 10:30', 30, '2026-11-20', '10:30', null),
  ('5e550000-0000-4000-8000-000000000206', '5e550000-0000-4000-8000-0000000000e1', 'Otro día',      30, '2026-11-21', '10:00', '11:00');

insert into public.session_registrations (registration_id, session_id)
values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-000000000201');

select throws_ok(
  $$ insert into public.session_registrations (registration_id, session_id)
     values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-000000000202') $$,
  'P0001', null,
  'una sesión que empieza durante la hackathon choca');

select throws_ok(
  $$ insert into public.session_registrations (registration_id, session_id)
     values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-000000000204') $$,
  'P0001', null,
  'misma hora de inicio sigue chocando');

select throws_ok(
  $$ insert into public.session_registrations (registration_id, session_id)
     values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-000000000205') $$,
  'P0001', null,
  'una sesión sin hora de fin dentro de la hackathon choca');

select lives_ok(
  $$ insert into public.session_registrations (registration_id, session_id)
     values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-000000000203') $$,
  'empezar justo cuando termina la otra no choca');

select lives_ok(
  $$ insert into public.session_registrations (registration_id, session_id)
     values ('5e550000-0000-4000-8000-000000000101', '5e550000-0000-4000-8000-000000000206') $$,
  'la misma hora en otro día no choca');

select is(
  (select count(*)::int from public.session_registrations where registration_id = '5e550000-0000-4000-8000-000000000101'),
  3,
  'quedan solo las inscripciones sin choque');

select * from finish();

rollback;
