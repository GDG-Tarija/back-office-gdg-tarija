-- Cupo de una fase con inscritos: SUPERADMIN lo cambia desde el back-office (rol authenticated).
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '9c000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'superadmin@cupo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '9c000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'staff@cupo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '9c000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'u1@cupo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '9c000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'u2@cupo-test.test'),
  ('00000000-0000-0000-0000-000000000000', '9c000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'u3@cupo-test.test');

insert into public.staff_whitelist (email, role) values
  ('superadmin@cupo-test.test', 'SUPERADMIN'),
  ('staff@cupo-test.test',      'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('9c000000-0000-4000-8000-0000000000e1', 'Evento cupo test', 'evento-cupo-test', 'MEETUP', 100, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('9c000000-0000-4000-8000-0000000000f1', '9c000000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

insert into public.ticket_phases (id, ticket_type_id, name, position, price, capacity) values
  ('9c000000-0000-4000-8000-0000000000c1', '9c000000-0000-4000-8000-0000000000f1', 'Preventa', 1, 0, 5),
  ('9c000000-0000-4000-8000-0000000000c2', '9c000000-0000-4000-8000-0000000000f1', 'General',  2, 0, null);

-- Tres inscritos: el trigger de registrations los asigna a la Preventa.
insert into public.registrations (event_id, user_id, ticket_type_id, status) values
  ('9c000000-0000-4000-8000-0000000000e1', '9c000000-0000-4000-8000-0000000000b1', '9c000000-0000-4000-8000-0000000000f1', 'CONFIRMED'),
  ('9c000000-0000-4000-8000-0000000000e1', '9c000000-0000-4000-8000-0000000000b2', '9c000000-0000-4000-8000-0000000000f1', 'PENDING'),
  ('9c000000-0000-4000-8000-0000000000e1', '9c000000-0000-4000-8000-0000000000b3', '9c000000-0000-4000-8000-0000000000f1', 'CONFIRMED');

select is(public.ticket_phase_sold('9c000000-0000-4000-8000-0000000000c1'), 3,
  'la Preventa tiene 3 inscritos');

set local role authenticated;
set local request.jwt.claims to '{"sub": "9c000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.ticket_phases set capacity = 8 where id = '9c000000-0000-4000-8000-0000000000c1' $$,
  'SUPERADMIN sube el cupo de una fase con inscritos');
select throws_ok(
  $$ update public.ticket_phases set capacity = 2 where id = '9c000000-0000-4000-8000-0000000000c1' $$,
  '23001', null,
  'no se baja el cupo por debajo de lo vendido');
select throws_ok(
  $$ select public.ticket_phase_sold('9c000000-0000-4000-8000-0000000000c1') $$,
  '42501', null,
  'ticket_phase_sold sigue sin poder llamarse como authenticated');

set local request.jwt.claims to '{"sub": "9c000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ update public.ticket_phases set capacity = 20 where id = '9c000000-0000-4000-8000-0000000000c1' returning id $$,
  'STAFF no edita fases');
reset role;

select is((select capacity from public.ticket_phases where id = '9c000000-0000-4000-8000-0000000000c1'), 8,
  'queda el cupo que puso SUPERADMIN');

select * from finish();

rollback;
