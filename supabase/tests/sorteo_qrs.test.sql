-- QRs del sorteo: claim_qr_ticket (el asistente escanea el QR de una mesa) y quién puede crear,
-- apagar o leer esos QRs.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- a1 superadmin · b1 Ana · b2 Beto · b3 Caro (sin check-in) · b5 sin inscripción
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       jsonb_build_object('given_name', given)
from (values
  ('5a780000-0000-4000-8000-0000000000a1', 'superadmin@qr-test.test', 'Super'),
  ('5a780000-0000-4000-8000-0000000000b1', 'ana@qr-test.test', 'Ana'),
  ('5a780000-0000-4000-8000-0000000000b2', 'beto@qr-test.test', 'Beto'),
  ('5a780000-0000-4000-8000-0000000000b3', 'caro@qr-test.test', 'Caro'),
  ('5a780000-0000-4000-8000-0000000000b5', 'nadie@qr-test.test', 'Nadie')
) as u (id, email, given);

insert into public.staff_whitelist (email, role) values ('superadmin@qr-test.test', 'SUPERADMIN');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('5a780000-0000-4000-8000-0000000000e1', 'Evento QR test', 'evento-qr-test', 'MEETUP', 50, now(), true);

insert into public.ticket_types (id, event_id, name, price)
values ('5a780000-0000-4000-8000-0000000000f1', '5a780000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

-- La inscripción usa el mismo sufijo que el usuario: 5a78…01b1 es la de Ana.
insert into public.registrations (id, event_id, user_id, ticket_type_id, status, event_role)
select ('5a780000-0000-4000-8000-0000000001' || u)::uuid,
       '5a780000-0000-4000-8000-0000000000e1',
       ('5a780000-0000-4000-8000-0000000000' || u)::uuid,
       '5a780000-0000-4000-8000-0000000000f1', 'CONFIRMED', 'ATTENDEE'
from unnest(array['b1', 'b2', 'b3']) as u;

-- Todos hicieron check-in menos Caro.
insert into public.scan_logs (registration_id, scan_type)
select id, 'checkin' from public.registrations
where event_id = '5a780000-0000-4000-8000-0000000000e1'
  and id <> '5a780000-0000-4000-8000-0000000001b3';

insert into public.point_activities (id, event_id, name)
values ('5a780000-0000-4000-8000-0000000000d1', '5a780000-0000-4000-8000-0000000000e1', 'Feria · Flutter Tarija');
insert into public.point_activity_qrs (id, activity_id)
values ('5a780000-0000-4000-8000-0000000000c1', '5a780000-0000-4000-8000-0000000000d1');

-- ---------------------------------------------------------------------------
-- Ana escanea el QR de la mesa
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000b1", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.point_activity_qrs $$,
  'un asistente no puede leer los códigos de los QRs');
select throws_ok(
  $$ insert into public.point_activities (event_id, name) values ('5a780000-0000-4000-8000-0000000000e1', 'Trampa') $$,
  '42501', null, 'un asistente no puede crear actividades');
select throws_ok(
  $$ insert into public.point_activity_qrs (activity_id) values ('5a780000-0000-4000-8000-0000000000d1') $$,
  '42501', null, 'un asistente no puede crear QRs');
select is(
  public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', '5a780000-0000-4000-8000-0000000000c1'),
  '{"status": "ok", "name": "Feria · Flutter Tarija"}'::jsonb,
  'escanear el QR suma el ticket de esa actividad');
select is(
  public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', '5a780000-0000-4000-8000-0000000000c1') ->> 'status', 'already',
  'el mismo QR no suma dos veces');
select is(
  public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', gen_random_uuid()),
  '{"status": "invalid"}'::jsonb,
  'un código inventado no suma');
select is(
  public.claim_qr_ticket(gen_random_uuid(), '5a780000-0000-4000-8000-0000000000c1'),
  '{"status": "invalid"}'::jsonb,
  'el QR de otro evento no cuenta en este');
select is(
  (select count(*)::int from jsonb_array_elements(public.my_tickets('5a780000-0000-4000-8000-0000000000e1') -> 'tickets') t
   where t ->> 'kind' = 'activity' and t ->> 'label' = 'Feria · Flutter Tarija'), 1,
  'el ticket del QR aparece en mis tickets');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000b3", "role": "authenticated"}';
select is(
  public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', '5a780000-0000-4000-8000-0000000000c1') ->> 'status', 'not_checked_in',
  'sin check-in el QR no suma');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000b5", "role": "authenticated"}';
select is(
  public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', '5a780000-0000-4000-8000-0000000000c1') ->> 'status', 'not_registered',
  'sin inscripción confirmada el QR no suma');
reset role;

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok(
  $$ select public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', '5a780000-0000-4000-8000-0000000000c1') $$,
  '42501', null, 'anon: no puede sumar con el QR');
reset role;

-- ---------------------------------------------------------------------------
-- El superadmin los administra desde el back-office
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.point_activities (id, event_id, name)
     values ('5a780000-0000-4000-8000-0000000000d2', '5a780000-0000-4000-8000-0000000000e1', 'QR del grupo') $$,
  'el superadmin crea una actividad');
select lives_ok(
  $$ insert into public.point_activity_qrs (activity_id) values ('5a780000-0000-4000-8000-0000000000d2') $$,
  'el superadmin crea su QR');
select results_eq(
  $$ update public.point_activity_qrs set active = false
     where id = '5a780000-0000-4000-8000-0000000000c1' returning active $$,
  $$ values (false) $$,
  'el superadmin apaga un QR');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select is(
  public.claim_qr_ticket('5a780000-0000-4000-8000-0000000000e1', '5a780000-0000-4000-8000-0000000000c1'),
  '{"status": "invalid"}'::jsonb,
  'un QR apagado ya no suma');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select is(
  jsonb_array_length(public.my_tickets('5a780000-0000-4000-8000-0000000000e1') -> 'tickets'), 2,
  'apagar el QR no quita los tickets que ya dio (check-in + actividad)');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a780000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ delete from public.point_activities where id = '5a780000-0000-4000-8000-0000000000d1' returning name $$,
  $$ values ('Feria · Flutter Tarija') $$,
  'el superadmin borra una actividad');
reset role;

select is(
  (select count(*)::int from public.point_activity_qrs where activity_id = '5a780000-0000-4000-8000-0000000000d1'), 0,
  'borrar la actividad borra su QR');

select * from finish();
rollback;
