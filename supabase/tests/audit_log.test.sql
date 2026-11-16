-- Auditoría: qué registra el trigger y quién puede leer o tocar audit_log.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Transacción con ROLLBACK y datos propios.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000004a1', 'authenticated', 'authenticated', 'admin@audit-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000004a2', 'authenticated', 'authenticated', 'puerta@audit-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000004b1', 'authenticated', 'authenticated', 'asistente@audit-test.test'),
  ('00000000-0000-0000-0000-000000000000', '7e570000-0000-4000-8000-0000000004b2', 'authenticated', 'authenticated', 'otra@audit-test.test');

insert into public.staff_whitelist (email, role) values
  ('admin@audit-test.test',  'SUPERADMIN'),
  ('puerta@audit-test.test', 'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('7e570000-0000-4000-8000-0000000004e1', 'Evento auditoría test', 'evento-auditoria-test', 'MEETUP', 50, now() + interval '7 days', true);

insert into public.ticket_types (id, event_id, name, price)
values ('7e570000-0000-4000-8000-0000000004f1', '7e570000-0000-4000-8000-0000000004e1', 'Entrada test', 0);

insert into public.event_staff_assignments (event_id, staff_email)
values ('7e570000-0000-4000-8000-0000000004e1', 'puerta@audit-test.test');

insert into public.registrations (id, event_id, user_id, ticket_type_id, status) values
  ('7e570000-0000-4000-8000-000000000401', '7e570000-0000-4000-8000-0000000004e1', '7e570000-0000-4000-8000-0000000004b1', '7e570000-0000-4000-8000-0000000004f1', 'PENDING');

-- ---------------------------------------------------------------------------
-- Inscripción desde la web: el actor es la propia persona, sin rol del back-office
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000004b2", "role": "authenticated", "email": "otra@audit-test.test"}';
insert into public.registrations (id, event_id, user_id, ticket_type_id)
values ('7e570000-0000-4000-8000-000000000402', '7e570000-0000-4000-8000-0000000004e1', '7e570000-0000-4000-8000-0000000004b2', '7e570000-0000-4000-8000-0000000004f1');
reset role;

select is(
  (select actor_id::text || '|' || coalesce(actor_role, '-') || '|' || event_id::text from public.audit_log
    where table_name = 'registrations' and action = 'INSERT' and record_id = '7e570000-0000-4000-8000-000000000402'),
  '7e570000-0000-4000-8000-0000000004b2|-|7e570000-0000-4000-8000-0000000004e1',
  'inscripción web: actor = la persona, sin rol del back-office, con su evento'
);

-- ---------------------------------------------------------------------------
-- SUPERADMIN confirma un pago: solo se guarda lo que cambió
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000004a1", "role": "authenticated", "email": "admin@audit-test.test"}';
update public.registrations set status = 'CONFIRMED' where id = '7e570000-0000-4000-8000-000000000401';
-- Un UPDATE sin cambios reales (solo toca updated_at por trigger) no debe registrar nada.
update public.registrations set status = 'CONFIRMED' where id = '7e570000-0000-4000-8000-000000000401';
reset role;

select is(
  (select count(*)::int from public.audit_log
    where table_name = 'registrations' and action = 'UPDATE' and record_id = '7e570000-0000-4000-8000-000000000401'),
  1,
  'un UPDATE sin cambios reales no se registra'
);
select is(
  (select changes from public.audit_log
    where table_name = 'registrations' and action = 'UPDATE' and record_id = '7e570000-0000-4000-8000-000000000401'),
  '{"status": ["PENDING", "CONFIRMED"]}'::jsonb,
  'confirmar el pago guarda solo el estado antes y después (sin updated_at)'
);
select is(
  (select actor_email || '|' || actor_role from public.audit_log
    where table_name = 'registrations' and action = 'UPDATE' and record_id = '7e570000-0000-4000-8000-000000000401'),
  'admin@audit-test.test|SUPERADMIN',
  'el cambio de estado queda con el correo y el rol de quien lo hizo'
);

-- ---------------------------------------------------------------------------
-- STAFF hace check-in y lo deshace
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000004a2", "role": "authenticated", "email": "puerta@audit-test.test"}';
insert into public.scan_logs (id, registration_id, scanned_by, scan_type)
values ('7e570000-0000-4000-8000-000000000501', '7e570000-0000-4000-8000-000000000401', '7e570000-0000-4000-8000-0000000004a2', 'checkin');
delete from public.scan_logs where id = '7e570000-0000-4000-8000-000000000501';

select is_empty($$ select 1 from public.audit_log $$, 'STAFF: no ve la auditoría');
select throws_ok(
  $$ insert into public.audit_log (action, table_name) values ('INSERT', 'falso') $$,
  '42501', null, 'STAFF: no puede escribir en la auditoría'
);
reset role;

select is(
  (select string_agg(action || ':' || actor_role || ':' || event_id::text, ',' order by id) from public.audit_log
    where table_name = 'scan_logs' and record_id = '7e570000-0000-4000-8000-000000000501'),
  'INSERT:STAFF:7e570000-0000-4000-8000-0000000004e1,DELETE:STAFF:7e570000-0000-4000-8000-0000000004e1',
  'el check-in y su "Deshacer" quedan registrados con el operador y el evento'
);

-- ---------------------------------------------------------------------------
-- Nadie modifica ni borra el historial desde la app; solo SUPERADMIN lo lee
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "7e570000-0000-4000-8000-0000000004a1", "role": "authenticated", "email": "admin@audit-test.test"}';
select isnt_empty(
  $$ select 1 from public.audit_log where event_id = '7e570000-0000-4000-8000-0000000004e1' $$,
  'SUPERADMIN: lee la auditoría'
);
select throws_ok($$ update public.audit_log set actor_email = 'otro@x.test' $$, '42501', null,
  'SUPERADMIN: no puede editar la auditoría');
select throws_ok($$ delete from public.audit_log $$, '42501', null,
  'SUPERADMIN: no puede borrar la auditoría');
select throws_ok($$ truncate public.audit_log $$, '42501', null,
  'SUPERADMIN: no puede vaciar la auditoría');
reset role;

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select is_empty($$ select 1 from public.audit_log $$, 'anónimo: no ve la auditoría');
reset role;

-- ---------------------------------------------------------------------------
-- Cambios hechos fuera de la app (consola, migraciones) quedan como "Sistema"
-- ---------------------------------------------------------------------------
update public.events set capacity = 60 where id = '7e570000-0000-4000-8000-0000000004e1';
select is(
  (select coalesce(actor_id::text, 'Sistema') || '|' || (changes -> 'capacity')::text from public.audit_log
    where table_name = 'events' and action = 'UPDATE' and record_id = '7e570000-0000-4000-8000-0000000004e1'),
  'Sistema|[50, 60]',
  'un cambio sin sesión queda como Sistema, con el antes y el después'
);

select is(
  (select event_id::text from public.audit_log
    where table_name = 'staff_whitelist' and action = 'INSERT' and changes ->> 'email' = 'puerta@audit-test.test'),
  null,
  'los cambios de accesos no pertenecen a ningún evento'
);

select * from finish();
rollback;
