-- Roles de evento Mentor (MENTOR) y Comunidad aliada (PARTNER): cupón, inscripción y sorteo.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Transacción con ROLLBACK y datos propios.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- a1 superadmin · m1 mentora · p1 comunidad aliada · x1 asistente que ya ganó
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       jsonb_build_object('given_name', given)
from (values
  ('70e10000-0000-4000-8000-0000000000a1', 'super@roles-test.test', 'Super'),
  ('70e10000-0000-4000-8000-0000000000d1', 'mentora@roles-test.test', 'Mentora'),
  ('70e10000-0000-4000-8000-0000000000d2', 'aliada@roles-test.test', 'Aliada')
) as u (id, email, given);

insert into public.staff_whitelist (email, role) values ('super@roles-test.test', 'SUPERADMIN');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('70e10000-0000-4000-8000-0000000000e1', 'Evento roles test', 'evento-roles-test', 'MEETUP', 50, now(), true);

-- Paquete de pago: sin cupón quedarían pendientes de pago.
insert into public.ticket_types (id, event_id, name, price, payment_qr_url)
values ('70e10000-0000-4000-8000-0000000000f1', '70e10000-0000-4000-8000-0000000000e1', 'Entrada test', 50, 'https://x.test/qr.png');

-- ---------------------------------------------------------------------------
-- Cupones con los roles nuevos
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.event_coupons (id, event_id, code, role, max_uses) values
       ('70e10000-0000-4000-8000-0000000000c1', '70e10000-0000-4000-8000-0000000000e1', 'MENTORES', 'MENTOR', 5),
       ('70e10000-0000-4000-8000-0000000000c2', '70e10000-0000-4000-8000-0000000000e1', 'ALIADAS', 'PARTNER', 5) $$,
  'se pueden crear cupones de Mentor y de Comunidad aliada'
);
select throws_ok(
  $$ insert into public.event_coupons (event_id, code, role, max_uses)
     values ('70e10000-0000-4000-8000-0000000000e1', 'OTRO', 'MODERADOR', 5) $$,
  '23514', null,
  'un rol que no existe sigue rechazado'
);

-- ---------------------------------------------------------------------------
-- Inscripción desde la web con cada cupón: el rol lo pone el cupón y queda confirmada
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "70e10000-0000-4000-8000-0000000000d1", "role": "authenticated", "email": "mentora@roles-test.test"}';
insert into public.registrations (id, event_id, user_id, ticket_type_id, coupon_id)
values ('70e10000-0000-4000-8000-0000000001d1', '70e10000-0000-4000-8000-0000000000e1',
        '70e10000-0000-4000-8000-0000000000d1', '70e10000-0000-4000-8000-0000000000f1',
        '70e10000-0000-4000-8000-0000000000c1');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "70e10000-0000-4000-8000-0000000000d2", "role": "authenticated", "email": "aliada@roles-test.test"}';
insert into public.registrations (id, event_id, user_id, ticket_type_id, coupon_id)
values ('70e10000-0000-4000-8000-0000000001d2', '70e10000-0000-4000-8000-0000000000e1',
        '70e10000-0000-4000-8000-0000000000d2', '70e10000-0000-4000-8000-0000000000f1',
        '70e10000-0000-4000-8000-0000000000c2');
reset role;

select is(
  (select event_role || '|' || status from public.registrations where id = '70e10000-0000-4000-8000-0000000001d1'),
  'MENTOR|CONFIRMED',
  'el cupón de Mentor inscribe como Mentor y confirmada, sin pago'
);
select is(
  (select event_role || '|' || status from public.registrations where id = '70e10000-0000-4000-8000-0000000001d2'),
  'PARTNER|CONFIRMED',
  'el cupón de Comunidad aliada inscribe como Comunidad aliada y confirmada, sin pago'
);
select is(
  (select max(package_sold)::int from public.get_ticket_availability('70e10000-0000-4000-8000-0000000000e1')),
  0,
  'Mentor y Comunidad aliada no ocupan cupo del paquete'
);

-- Las dos hacen check-in.
insert into public.scan_logs (registration_id, scan_type) values
  ('70e10000-0000-4000-8000-0000000001d1', 'checkin'),
  ('70e10000-0000-4000-8000-0000000001d2', 'checkin');

-- ---------------------------------------------------------------------------
-- Networking y tickets de actividad (la mentora)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "70e10000-0000-4000-8000-0000000000d1", "role": "authenticated", "email": "mentora@roles-test.test"}';
select is(
  public.scan_ticket('70e10000-0000-4000-8000-0000000000e1', '70e10000-0000-4000-8000-0000000001d2') ->> 'status',
  'ok',
  'Mentor puede hacer networking'
);
select is(
  public.my_tickets('70e10000-0000-4000-8000-0000000000e1') ->> 'can_award',
  'false',
  'Mentor no da tickets de actividad (eso sigue siendo de Expositor, Sponsor y Staff)'
);
reset role;

-- ---------------------------------------------------------------------------
-- Sorteo: participa Comunidad aliada, no Mentor
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "70e10000-0000-4000-8000-0000000000a1", "role": "authenticated", "email": "super@roles-test.test"}';
select is(
  public.draw_raffle('70e10000-0000-4000-8000-0000000000e1', 'Polera') ->> 'registration_id',
  '70e10000-0000-4000-8000-0000000001d2',
  'Comunidad aliada entra al sorteo'
);
select is(
  public.draw_raffle('70e10000-0000-4000-8000-0000000000e1', 'Taza') ->> 'status',
  'empty',
  'Mentor no entra al sorteo: con la aliada ya ganadora no queda nadie'
);
reset role;

select is(
  (select count(*)::int from public.raffle_winners where event_id = '70e10000-0000-4000-8000-0000000000e1'),
  1,
  'solo hubo una ganadora'
);
select throws_ok(
  $$ update public.registrations set event_role = 'MODERADOR'
     where id = '70e10000-0000-4000-8000-0000000001d1' $$,
  '23514', null,
  'una inscripción tampoco acepta roles que no existen'
);

select * from finish();
rollback;
