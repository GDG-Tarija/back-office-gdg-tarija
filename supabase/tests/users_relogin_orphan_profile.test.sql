-- Cuenta de login recreada: el perfil viejo (mismo correo, otro id) tiene una inscripción y un
-- escaneo. Al entrar con la cuenta nueva, upsert_user_profile() debe pasarle el perfil.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con
-- ROLLBACK y con datos ficticios propios de esta prueba.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Perfil viejo, sin cuenta de login (se borró), con una inscripción y un escaneo hecho por él.
insert into public.users (id, email, first_name, last_name)
values ('7a000000-0000-4000-8000-0000000000b0', 'reentra@relogin-test.test', 'Vieja', 'Cuenta');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published)
values ('7a000000-0000-4000-8000-0000000000e1', 'Evento relogin test', 'evento-relogin-test', 'MEETUP', 50, now() + interval '7 days', true);
insert into public.ticket_types (id, event_id, name, price)
values ('7a000000-0000-4000-8000-0000000000f1', '7a000000-0000-4000-8000-0000000000e1', 'Entrada test', 0);
insert into public.registrations (id, event_id, user_id, ticket_type_id, status)
values ('7a000000-0000-4000-8000-000000000101', '7a000000-0000-4000-8000-0000000000e1',
        '7a000000-0000-4000-8000-0000000000b0', '7a000000-0000-4000-8000-0000000000f1', 'CONFIRMED');
insert into public.scan_logs (registration_id, scanned_by, scan_type)
values ('7a000000-0000-4000-8000-000000000101', '7a000000-0000-4000-8000-0000000000b0', 'checkin');

-- Cuenta nueva con el mismo correo: handle_new_user no puede crear su perfil (correo repetido).
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '7a000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'reentra@relogin-test.test');

select is_empty(
  $$ select 1 from public.users where id = '7a000000-0000-4000-8000-0000000000b1' $$,
  'la cuenta nueva arranca sin perfil');

set local role authenticated;
set local request.jwt.claims to '{"sub": "7a000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.upsert_user_profile('7a000000-0000-4000-8000-0000000000b1', 'reentra@relogin-test.test', 'Nueva', 'Cuenta') $$,
  'al entrar, upsert_user_profile le pasa el perfil viejo');
reset role;

select is(
  (select user_id from public.registrations where id = '7a000000-0000-4000-8000-000000000101'),
  '7a000000-0000-4000-8000-0000000000b1'::uuid,
  'su inscripción vieja pasa a la cuenta nueva');
select is(
  (select count(*)::int from public.scan_logs where scanned_by = '7a000000-0000-4000-8000-0000000000b1'),
  1, 'el escaneo que hizo también');
select is_empty(
  $$ select 1 from public.users where id = '7a000000-0000-4000-8000-0000000000b0' $$,
  'no queda el perfil huérfano');

select * from finish();

rollback;
