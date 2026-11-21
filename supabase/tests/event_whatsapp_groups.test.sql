-- Link del grupo de WhatsApp: solo lo leen inscritos no anulados y staff; lo edita SUPERADMIN.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '3a770000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'superadmin@wa-test.test'),
  ('00000000-0000-0000-0000-000000000000', '3a770000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'staff@wa-test.test'),
  ('00000000-0000-0000-0000-000000000000', '3a770000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'pendiente@wa-test.test'),
  ('00000000-0000-0000-0000-000000000000', '3a770000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'confirmado@wa-test.test'),
  ('00000000-0000-0000-0000-000000000000', '3a770000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'anulado@wa-test.test'),
  ('00000000-0000-0000-0000-000000000000', '3a770000-0000-4000-8000-0000000000b4', 'authenticated', 'authenticated', 'otro@wa-test.test');

insert into public.staff_whitelist (email, role) values
  ('superadmin@wa-test.test', 'SUPERADMIN'),
  ('staff@wa-test.test',      'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('3a770000-0000-4000-8000-0000000000e1', 'Evento WA test', 'evento-wa-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('3a770000-0000-4000-8000-0000000000f1', '3a770000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

insert into public.event_staff_assignments (event_id, staff_email)
values ('3a770000-0000-4000-8000-0000000000e1', 'staff@wa-test.test');

insert into public.registrations (id, event_id, user_id, ticket_type_id, status) values
  ('3a770000-0000-4000-8000-000000000101', '3a770000-0000-4000-8000-0000000000e1', '3a770000-0000-4000-8000-0000000000b1', '3a770000-0000-4000-8000-0000000000f1', 'PENDING'),
  ('3a770000-0000-4000-8000-000000000102', '3a770000-0000-4000-8000-0000000000e1', '3a770000-0000-4000-8000-0000000000b2', '3a770000-0000-4000-8000-0000000000f1', 'CONFIRMED'),
  ('3a770000-0000-4000-8000-000000000103', '3a770000-0000-4000-8000-0000000000e1', '3a770000-0000-4000-8000-0000000000b3', '3a770000-0000-4000-8000-0000000000f1', 'CANCELLED');

-- SUPERADMIN carga el link
set local role authenticated;
set local request.jwt.claims to '{"sub": "3a770000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.event_whatsapp_groups (event_id, url)
     values ('3a770000-0000-4000-8000-0000000000e1', 'https://chat.whatsapp.com/AbCdEf123') $$,
  'SUPERADMIN: puede cargar el link');
select throws_ok(
  $$ update public.event_whatsapp_groups set url = 'https://ejemplo.com/grupo'
     where event_id = '3a770000-0000-4000-8000-0000000000e1' $$,
  '23514', null,
  'solo acepta links de invitación de chat.whatsapp.com');
reset role;

-- Lectura por tipo de persona
create function pg_temp.reads_link(p_user uuid) returns boolean language plpgsql as $$
declare v_found boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select exists (select 1 from public.event_whatsapp_groups where event_id = '3a770000-0000-4000-8000-0000000000e1') into v_found;
  reset role;
  return v_found;
end $$;

select ok(pg_temp.reads_link('3a770000-0000-4000-8000-0000000000b1'), 'inscrito con pago pendiente: ve el link');
select ok(pg_temp.reads_link('3a770000-0000-4000-8000-0000000000b2'), 'inscrito confirmado: ve el link');
select ok(not pg_temp.reads_link('3a770000-0000-4000-8000-0000000000b3'), 'inscripción anulada: no ve el link');
select ok(not pg_temp.reads_link('3a770000-0000-4000-8000-0000000000b4'), 'sin inscripción: no ve el link');
select ok(pg_temp.reads_link('3a770000-0000-4000-8000-0000000000a2'), 'staff asignado al evento: ve el link');

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select is_empty($$ select 1 from public.event_whatsapp_groups $$, 'anon: no ve el link');
reset role;

-- Escritura: ni inscritos ni staff
set local role authenticated;
set local request.jwt.claims to '{"sub": "3a770000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select is_empty(
  $$ update public.event_whatsapp_groups set url = 'https://chat.whatsapp.com/Otro999' returning id $$,
  'inscrito: no puede cambiar el link');
set local request.jwt.claims to '{"sub": "3a770000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ delete from public.event_whatsapp_groups returning id $$,
  'staff: no puede borrar el link');
reset role;

select * from finish();

rollback;
