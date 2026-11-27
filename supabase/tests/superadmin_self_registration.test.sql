-- Un SUPERADMIN que se inscribe desde la web sigue las mismas reglas que cualquier persona
-- (20261127022457). Antes quedaba PENDING aunque usara un cupón de descuento total.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Transacción con ROLLBACK y datos propios.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '5e1f0000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'organizador@self-test.test');

insert into public.staff_whitelist (email, role) values ('organizador@self-test.test', 'SUPERADMIN');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('5e1f0000-0000-4000-8000-0000000000e1', 'Evento self test', 'evento-self-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price, payment_qr_url) values
  ('5e1f0000-0000-4000-8000-0000000000f1', '5e1f0000-0000-4000-8000-0000000000e1', 'De pago', 20, 'https://x.test/qr.png'),
  ('5e1f0000-0000-4000-8000-0000000000f2', '5e1f0000-0000-4000-8000-0000000000e1', 'Gratis', 0, null);

insert into public.event_coupons (id, event_id, code, role, max_uses) values
  ('5e1f0000-0000-4000-8000-0000000000c1', '5e1f0000-0000-4000-8000-0000000000e1', 'GRATIS-TOTAL', 'ATTENDEE', 5),
  ('5e1f0000-0000-4000-8000-0000000000c2', '5e1f0000-0000-4000-8000-0000000000e1', 'EQUIPO', 'STAFF', 5);

-- Inscribe al organizador con su propia sesión, como lo hace la web (sin enviar estado salvo
-- que se indique), y devuelve "rol|estado". Cada caso parte sin inscripción previa.
create function pg_temp.self_register(p_type uuid, p_coupon uuid, p_role text, p_status text)
returns text language plpgsql as $$
declare v text;
begin
  reset role;
  delete from public.registrations where user_id = '5e1f0000-0000-4000-8000-0000000000a1';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub": "5e1f0000-0000-4000-8000-0000000000a1", "role": "authenticated", "email": "organizador@self-test.test"}', true);
  if p_status is null then
    insert into public.registrations (event_id, user_id, ticket_type_id, coupon_id, event_role)
    values ('5e1f0000-0000-4000-8000-0000000000e1', '5e1f0000-0000-4000-8000-0000000000a1', p_type, p_coupon, p_role)
    returning event_role || '|' || status into v;
  else
    insert into public.registrations (event_id, user_id, ticket_type_id, coupon_id, event_role, status)
    values ('5e1f0000-0000-4000-8000-0000000000e1', '5e1f0000-0000-4000-8000-0000000000a1', p_type, p_coupon, p_role, p_status)
    returning event_role || '|' || status into v;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

select is(
  pg_temp.self_register('5e1f0000-0000-4000-8000-0000000000f1', '5e1f0000-0000-4000-8000-0000000000c1', 'ATTENDEE', null),
  'ATTENDEE|CONFIRMED',
  'paquete de pago con cupón de descuento total: queda confirmada (antes quedaba pendiente)'
);
select is(
  pg_temp.self_register('5e1f0000-0000-4000-8000-0000000000f2', null, 'ATTENDEE', null),
  'ATTENDEE|CONFIRMED',
  'paquete gratis: queda confirmada'
);
select is(
  pg_temp.self_register('5e1f0000-0000-4000-8000-0000000000f1', null, 'ATTENDEE', null),
  'ATTENDEE|PENDING',
  'paquete de pago sin cupón: queda pendiente de pago, como cualquiera'
);
select is(
  pg_temp.self_register('5e1f0000-0000-4000-8000-0000000000f1', null, 'STAFF', 'CONFIRMED'),
  'ATTENDEE|PENDING',
  'no puede fijarse rol ni estado por su cuenta desde la web'
);
select is(
  pg_temp.self_register('5e1f0000-0000-4000-8000-0000000000f1', '5e1f0000-0000-4000-8000-0000000000c2', 'ATTENDEE', null),
  'STAFF|CONFIRMED',
  'con cupón de Staff: rol Staff y confirmada'
);

-- Sin JWT (consola, migraciones) se sigue respetando lo enviado: así se corrigen datos a mano.
delete from public.registrations where user_id = '5e1f0000-0000-4000-8000-0000000000a1';
insert into public.registrations (event_id, user_id, ticket_type_id, event_role, status)
values ('5e1f0000-0000-4000-8000-0000000000e1', '5e1f0000-0000-4000-8000-0000000000a1',
        '5e1f0000-0000-4000-8000-0000000000f1', 'SPEAKER', 'CONFIRMED');
select is(
  (select event_role || '|' || status from public.registrations
    where user_id = '5e1f0000-0000-4000-8000-0000000000a1'),
  'SPEAKER|CONFIRMED',
  'sin JWT se respeta el rol y el estado enviados'
);

select * from finish();
rollback;
