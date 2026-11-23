-- Sorteo por tickets: scan_ticket (actividad y networking), my_tickets, draw_raffle y los cierres
-- que encontró el QA (inserts directos, autoregalo, nombres ajenos, fantasmas, premio en blanco).
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- a1 superadmin · b1 Ana · b2 Beto · b3 Caro (sin check-in) · b4 Sponsor · b5 sin inscripción
-- c1..c5 asistentes extra para el tope de networking.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       jsonb_build_object('given_name', given)
from (values
  ('5a770000-0000-4000-8000-0000000000a1', 'superadmin@sorteo-test.test', 'Super'),
  ('5a770000-0000-4000-8000-0000000000b1', 'ana@sorteo-test.test', 'Ana'),
  ('5a770000-0000-4000-8000-0000000000b2', 'beto@sorteo-test.test', 'Beto'),
  ('5a770000-0000-4000-8000-0000000000b3', 'caro@sorteo-test.test', 'Caro'),
  ('5a770000-0000-4000-8000-0000000000b4', 'sponsor@sorteo-test.test', 'Sponsor'),
  ('5a770000-0000-4000-8000-0000000000b5', 'nadie@sorteo-test.test', 'Nadie'),
  ('5a770000-0000-4000-8000-0000000000c1', 'x1@sorteo-test.test', 'X1'),
  ('5a770000-0000-4000-8000-0000000000c2', 'x2@sorteo-test.test', 'X2'),
  ('5a770000-0000-4000-8000-0000000000c3', 'x3@sorteo-test.test', 'X3'),
  ('5a770000-0000-4000-8000-0000000000c4', 'x4@sorteo-test.test', 'X4'),
  ('5a770000-0000-4000-8000-0000000000c5', 'x5@sorteo-test.test', 'X5')
) as u (id, email, given);

insert into public.staff_whitelist (email, role) values ('superadmin@sorteo-test.test', 'SUPERADMIN');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('5a770000-0000-4000-8000-0000000000e1', 'Evento sorteo test', 'evento-sorteo-test', 'MEETUP', 50, now(), true);

insert into public.ticket_types (id, event_id, name, price)
values ('5a770000-0000-4000-8000-0000000000f1', '5a770000-0000-4000-8000-0000000000e1', 'Entrada test', 0);

-- La inscripción usa el mismo sufijo que el usuario: 5a77…01b1 es la de Ana.
insert into public.registrations (id, event_id, user_id, ticket_type_id, status, event_role)
select ('5a770000-0000-4000-8000-0000000001' || right(u, 2))::uuid,
       '5a770000-0000-4000-8000-0000000000e1',
       ('5a770000-0000-4000-8000-0000000000' || right(u, 2))::uuid,
       '5a770000-0000-4000-8000-0000000000f1', 'CONFIRMED',
       case when u = 'b4' then 'SPONSOR' else 'ATTENDEE' end
from unnest(array['b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4', 'c5']) as u;

-- Todos hicieron check-in menos Caro.
insert into public.scan_logs (registration_id, scan_type)
select id, 'checkin' from public.registrations
where event_id = '5a770000-0000-4000-8000-0000000000e1'
  and id <> '5a770000-0000-4000-8000-0000000001b3';

insert into public.point_activities (id, event_id, name) values
  ('5a770000-0000-4000-8000-0000000000d1', '5a770000-0000-4000-8000-0000000000e1', 'Stand Google'),
  ('5a770000-0000-4000-8000-0000000000d2', '5a770000-0000-4000-8000-0000000000e1', 'Zona Zen');

-- ---------------------------------------------------------------------------
-- Networking (Ana)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';

select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b2') ->> 'status', 'ok',
  'networking: Ana escanea a Beto');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1') ->> 'status', 'self',
  'networking: escanear tu propio QR no suma');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b3') ->> 'status', 'not_checked_in',
  'networking: sin check-in de la otra persona no suma');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b4', '5a770000-0000-4000-8000-0000000000d1'),
  '{"status": "forbidden"}'::jsonb,
  'actividad: un asistente no puede dar tickets de actividad (y no ve el nombre)');
select is(
  public.scan_ticket(gen_random_uuid(), '5a770000-0000-4000-8000-0000000001b2') ->> 'status', 'invalid',
  'un QR de otro evento no cuenta en este');
reset role;

select is(
  (select count(*)::int from public.scan_logs
   where (registration_id = '5a770000-0000-4000-8000-0000000001b1' and scan_type = 'net:5a770000-0000-4000-8000-0000000001b2')
      or (registration_id = '5a770000-0000-4000-8000-0000000001b2' and scan_type = 'net:5a770000-0000-4000-8000-0000000001b1')),
  2, 'networking: suman los dos, Ana y Beto');

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1') ->> 'status', 'already',
  'networking: la pareja cuenta una sola vez, escanee quien escanee');
reset role;

-- Tope: Ana ya tiene 1 (Beto); con X1..X4 llega a 5 y X5 ya no le suma a ella, sí a X5.
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
do $$
begin
  perform public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', ('5a770000-0000-4000-8000-0000000001c' || n)::uuid)
  from generate_series(1, 4) as n;
end;
$$;
select results_eq(
  $$ select r ->> 'status', (r ->> 'mine_added')::boolean, (r ->> 'theirs_added')::boolean, (r ->> 'my_net')::int
     from (select public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001c5') as r) s $$,
  $$ values ('ok', false, true, 5) $$,
  'networking: pasado el tope de 5 ya no suma a quien escanea, sí a la otra persona');
reset role;

-- ---------------------------------------------------------------------------
-- Actividades
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b4", "role": "authenticated"}';
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1', '5a770000-0000-4000-8000-0000000000d1') ->> 'status', 'ok',
  'actividad: el sponsor da el ticket de su stand');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1', '5a770000-0000-4000-8000-0000000000d1') ->> 'status', 'already',
  'actividad: una sola vez por persona');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b4', '5a770000-0000-4000-8000-0000000000d1') ->> 'status', 'self',
  'actividad: quien da tickets no se los da a sí mismo');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b3', '5a770000-0000-4000-8000-0000000000d1') ->> 'status', 'not_checked_in',
  'actividad: sin check-in no suma (si no, el ticket daría certificado de asistencia)');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1', '5a770000-0000-4000-8000-0000000000d2') ->> 'status', 'ok',
  'actividad: el staff del back-office también da tickets sin estar inscrito');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type) values ('5a770000-0000-4000-8000-0000000001b2', 'pts:inventado') $$,
  '42501', null, 'insert directo: ni el superadmin puede fabricar tickets pts: por la API');
select throws_ok(
  $$ insert into public.scan_logs (registration_id, scan_type) values ('5a770000-0000-4000-8000-0000000001b2', 'net:inventado') $$,
  '42501', null, 'insert directo: tampoco tickets net:');
select lives_ok(
  $$ insert into public.scan_logs (registration_id, scan_type) values ('5a770000-0000-4000-8000-0000000001b3', 'refrigerio') $$,
  'insert directo: el check-in/refrigerio del back-office sigue funcionando');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b5", "role": "authenticated"}';
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1'),
  '{"status": "not_registered"}'::jsonb,
  'networking: sin inscripción no se puede, y no revela el nombre');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1', gen_random_uuid()),
  '{"status": "forbidden"}'::jsonb,
  'actividad: alguien sin permiso no ve el nombre de la persona');
reset role;

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok(
  $$ select public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001b1') $$,
  '42501', null, 'anon: no puede escanear');
select is(
  (select user_email from public.get_public_certificate('5a770000-0000-4000-8000-0000000001b1')), null,
  'certificado público: ya no devuelve el correo');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.raffle_tickets('5a770000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'raffle_tickets: es interna, ningún cliente la llama');
reset role;

-- ---------------------------------------------------------------------------
-- my_tickets (Ana: check-in + 5 networking + 2 actividades = 8)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select results_eq(
  $$ select (t ->> 'checked_in')::boolean, (t ->> 'can_award')::boolean, (t ->> 'net_count')::int,
            jsonb_array_length(t -> 'tickets')
     from (select public.my_tickets('5a770000-0000-4000-8000-0000000000e1') as t) s $$,
  $$ values (true, false, 5, 8) $$,
  'my_tickets: Ana ve sus 8 tickets y no puede dar actividades');
select ok(
  public.my_tickets('5a770000-0000-4000-8000-0000000000e1') -> 'tickets'
    @> '[{"kind": "activity", "label": "Stand Google", "by_me": false}, {"kind": "networking", "label": "Beto", "by_me": true}]',
  'my_tickets: cada ticket trae su motivo y si lo escaneó ella');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000c5", "role": "authenticated"}';
select ok(
  public.my_tickets('5a770000-0000-4000-8000-0000000000e1') -> 'tickets'
    @> '[{"kind": "networking", "label": "Ana", "by_me": false}]',
  'my_tickets: a X5 le aparece el ticket que le dio Ana al escanearlo');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b4", "role": "authenticated"}';
select is(
  (public.my_tickets('5a770000-0000-4000-8000-0000000000e1') ->> 'can_award')::boolean, true,
  'my_tickets: el sponsor puede dar tickets de actividad');
reset role;

-- Borrar una actividad borra sus tickets (no quedan fantasmas que sumen en el sorteo).
delete from public.point_activities where id = '5a770000-0000-4000-8000-0000000000d2';
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select is(
  jsonb_array_length(public.my_tickets('5a770000-0000-4000-8000-0000000000e1') -> 'tickets'), 7,
  'my_tickets: el ticket de una actividad borrada deja de contar');
reset role;

-- Deshacer el check-in de X4 borra sus tickets y el networking que Ana sumó con X4.
delete from public.scan_logs
where registration_id = '5a770000-0000-4000-8000-0000000001c4' and scan_type = 'checkin';
select is(
  (select count(*)::int from public.scan_logs where registration_id = '5a770000-0000-4000-8000-0000000001c4'),
  0, 'deshacer check-in: X4 se queda sin tickets (no hay certificado sin check-in)');
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select is(
  (public.my_tickets('5a770000-0000-4000-8000-0000000000e1') ->> 'net_count')::int, 4,
  'deshacer check-in: el networking de Ana con X4 deja de contar');
select is(
  public.scan_ticket('5a770000-0000-4000-8000-0000000000e1', '5a770000-0000-4000-8000-0000000001c5') ->> 'status', 'already',
  'deshacer check-in: el resto de sus parejas sigue igual');
reset role;
select throws_ok(
  $$ insert into public.point_activities (event_id, name) values ('5a770000-0000-4000-8000-0000000000e1', '   ') $$,
  '23514', null, 'point_activities: no se crea una actividad sin nombre');

-- ---------------------------------------------------------------------------
-- draw_raffle
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.draw_raffle('5a770000-0000-4000-8000-0000000000e1', 'Polera') $$,
  '42501', null, 'draw_raffle: solo un superadministrador sortea');
select is_empty($$ select id from public.raffle_winners $$, 'raffle_winners: un asistente no lee ganadores');
reset role;

-- X5 pierde su cuenta: su inscripción queda sin usuario y no puede ganar.
update public.registrations set user_id = null where id = '5a770000-0000-4000-8000-0000000001c5';

set local role authenticated;
set local request.jwt.claims to '{"sub": "5a770000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  format('select public.draw_raffle(%L, %L)', '5a770000-0000-4000-8000-0000000000e1', U&'\200B' || E'\t\n' || U&'\00A0'),
  '22023', null, 'draw_raffle: un premio de solo espacios o caracteres invisibles no vale');
select throws_ok(
  format('select public.draw_raffle(%L, %L)', '5a770000-0000-4000-8000-0000000000e1', U&'\00AD\200E\3164'),
  '22023', null, 'draw_raffle: tampoco un premio sin ninguna letra ni número');

-- Participan Ana, Beto y X1..X3 (5). Caro y X4 no tienen check-in, el sponsor no es ATTENDEE y X5 no tiene cuenta.
select results_eq(
  $$ select (r ->> 'status'), (r ->> 'participants')::int
     from (select public.draw_raffle('5a770000-0000-4000-8000-0000000000e1', '  Polera   GDG ') as r) s $$,
  $$ values ('ok', 5) $$,
  'draw_raffle: el primer sorteo es entre los 5 que cumplen todo');
do $$
begin
  for i in 2..5 loop
    perform public.draw_raffle('5a770000-0000-4000-8000-0000000000e1', 'Premio ' || i);
  end loop;
end;
$$;
select is(
  public.draw_raffle('5a770000-0000-4000-8000-0000000000e1', 'Premio 6') ->> 'status', 'empty',
  'draw_raffle: con todos ya ganadores no queda nadie');
reset role;

select is(
  (select count(distinct registration_id)::int from public.raffle_winners
   where event_id = '5a770000-0000-4000-8000-0000000000e1'),
  5, 'draw_raffle: 5 ganadores distintos, nadie repite');
select is_empty(
  $$ select 1 from public.raffle_winners
     where registration_id in ('5a770000-0000-4000-8000-0000000001b3', '5a770000-0000-4000-8000-0000000001b4',
                               '5a770000-0000-4000-8000-0000000001c4', '5a770000-0000-4000-8000-0000000001c5') $$,
  'draw_raffle: nunca sale quien no hizo check-in, quien no es ATTENDEE ni una inscripción sin cuenta');
select is(
  (select prize from public.raffle_winners where event_id = '5a770000-0000-4000-8000-0000000000e1' order by created_at limit 1),
  'Polera GDG', 'draw_raffle: el premio se guarda sin espacios sobrantes');
select is(
  (select tickets from public.raffle_winners where registration_id = '5a770000-0000-4000-8000-0000000001b1'),
  6, 'draw_raffle: guarda los mismos tickets que ve Ana');

select * from finish();
rollback;
