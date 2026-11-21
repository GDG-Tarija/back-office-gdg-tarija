-- list_audit_log(): filtros, nombres legibles y acceso solo para SUPERADMIN.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Transacción con ROLLBACK y datos propios.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000005a1', 'authenticated', 'authenticated', 'admin@queries-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000005a2', 'authenticated', 'authenticated', 'puerta@queries-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000005b1', 'authenticated', 'authenticated', 'ana@queries-test.test');

-- handle_new_user ya creó los perfiles al insertar en auth.users: solo se les pone nombre.
update public.users set first_name = 'Ada', last_name = 'Admin'
 where id = '7e570000-0000-4000-8000-0000000005a1';
update public.users set first_name = 'Ana', last_name = 'Asistente'
 where id = '7e570000-0000-4000-8000-0000000005b1';

insert into public.staff_whitelist (email, role) values
  ('admin@queries-test.test',  'SUPERADMIN'),
  ('puerta@queries-test.test', 'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('7e570000-0000-4000-8000-0000000005e1', 'Evento consultas test', 'evento-consultas-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('7e570000-0000-4000-8000-0000000005f1', '7e570000-0000-4000-8000-0000000005e1', 'Entrada consultas', 0);

insert into public.registrations (id, event_id, user_id, ticket_type_id, status) values
  ('7e570000-0000-4000-8000-000000000601', '7e570000-0000-4000-8000-0000000005e1', '7e570000-0000-4000-8000-0000000005b1', '7e570000-0000-4000-8000-0000000005f1', 'PENDING');

-- El superadmin confirma el pago y hace el check-in.
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000005a1", "role": "authenticated", "email": "admin@queries-test.test"}';
update public.registrations set status = 'CONFIRMED' where id = '7e570000-0000-4000-8000-000000000601';
insert into public.scan_logs (registration_id, scanned_by, scan_type)
values ('7e570000-0000-4000-8000-000000000601', '7e570000-0000-4000-8000-0000000005a1', 'checkin');

select is(
  (select count(*)::int from public.list_audit_log(p_registration_id => '7e570000-0000-4000-8000-000000000601')),
  3,
  'historial de la inscripción: alta, confirmación de pago y check-in'
);
select is(
  (select actor_name || '|' || subject_name || '|' || event_title from public.list_audit_log(
     p_registration_id => '7e570000-0000-4000-8000-000000000601', p_category => 'CHECKIN')),
  'Ada Admin|Ana Asistente|Evento consultas test',
  'devuelve quién actuó, sobre quién y en qué evento'
);
select is(
  (select max(total_count)::int from public.list_audit_log(
     p_event_id => '7e570000-0000-4000-8000-0000000005e1', p_limit => 1)),
  (select count(*)::int from public.audit_log where event_id = '7e570000-0000-4000-8000-0000000005e1'),
  'total_count cuenta todo lo filtrado aunque se pida una sola fila'
);
select is(
  (select count(*)::int from public.list_audit_log(
     p_event_id => '7e570000-0000-4000-8000-0000000005e1', p_limit => 1)),
  1,
  'respeta el límite de la página'
);
select ok(
  not exists (select 1 from public.list_audit_log(
     p_actor_id => '7e570000-0000-4000-8000-0000000005a1', p_category => 'ACCESS')),
  'filtra por persona y categoría a la vez'
);
select is(
  (select subject_name from public.list_audit_log(p_category => 'ACCESS')
    where table_name = 'staff_whitelist' and subject_name = 'puerta@queries-test.test' limit 1),
  'puerta@queries-test.test',
  'en cambios de accesos, el sujeto es el correo'
);
select throws_ok($$ select * from public.list_audit_log(p_category => 'OTRA') $$, 'P0020', null,
  'rechaza una categoría que no existe');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000005a2", "role": "authenticated", "email": "puerta@queries-test.test"}';
select throws_ok($$ select * from public.list_audit_log() $$, '42501', null,
  'STAFF: no puede consultar la auditoría');
reset role;

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok($$ select * from public.list_audit_log() $$, '42501', null,
  'anónimo: no puede consultar la auditoría');
reset role;

select * from finish();
rollback;
