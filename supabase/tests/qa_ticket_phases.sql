-- QA de preventa por fases (ticket_phases). Se ejecuta SIEMPRE con rollback: no deja residuos.
--   docker exec -i supabase_db_gdg-tarija psql -U postgres -d <db> -v ON_ERROR_STOP=1 \
--     < supabase/tests/qa_ticket_phases.sql
-- Cada prueba imprime "PASS: ..." o aborta con "FAIL: ...". Requiere la migración *_ticket_phases.
begin;

-- ---------- datos de prueba (como postgres, sin JWT) ----------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'qa-u1@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'qa-u2@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'qa-u3@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'qa-u4@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'qa-u5@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'qa-u6@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'qa-u7@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000008', 'qa-u8@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000009', 'qa-u9@test.local'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'qa-admin@test.local');
insert into public.users (id, email, first_name, last_name)
  select id, email, 'QA', 'User' from auth.users where email like 'qa-%@test.local'
  on conflict do nothing;  -- un trigger de auth.users puede haberlas creado ya
insert into public.staff_whitelist (email, role) values ('qa-admin@test.local', 'SUPERADMIN');

insert into public.events (id, title, slug, event_type, capacity, date_start)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'QA fases', 'qa-fases', 'MEETUP', 100, now() + interval '30 days'),
         ('bbbbbbbb-0000-4000-8000-000000000002', 'QA sin fases', 'qa-sin-fases', 'MEETUP', 100, now() + interval '30 days');

-- Paquete con fases: Preventa (cupo 2, Bs 30) -> Normal (cupo 3, Bs 50)
insert into public.ticket_types (id, event_id, name, price, ticket_capacity, payment_qr_url) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'General', 50, null, 'https://x/qr.png'),
-- Paquete sin fases (de pago) y gratis, con ticket_capacity = 1 (no se aplica en servidor, igual que antes)
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Legacy pago', 20, 1, 'https://x/qr.png'),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'Legacy gratis', 0, null, null);
insert into public.ticket_phases (id, ticket_type_id, name, position, price, capacity, payment_qr_url) values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Preventa', 1, 30, 2, 'https://x/qr30.png'),
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'Normal',   2, 50, 3, 'https://x/qr50.png');
insert into public.event_coupons (id, event_id, code, role, max_uses) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'QA-SPEAKER', 'SPEAKER', 5),
  ('eeeeeeee-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'QA-ATTENDEE', 'ATTENDEE', 5);

-- Helpers para actuar como usuario autenticado / superadmin
create function pg_temp.as_user(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', format('aaaaaaaa-0000-4000-8000-%s', lpad(to_hex(n), 12, '0')), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.as_admin() returns void language sql as $$ select pg_temp.as_user(10) $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

-- Inserta como usuario n (el cliente manda lo que quiere); devuelve la fila resultante
create function pg_temp.reg(n int, p_type uuid, p_role text default 'ATTENDEE', p_status text default 'PENDING',
                            p_phase uuid default null, p_coupon uuid default null)
returns public.registrations language plpgsql as $$
declare r public.registrations;
begin
  insert into public.registrations (event_id, user_id, ticket_type_id, event_role, status, ticket_phase_id, coupon_id)
  values ((select event_id from public.ticket_types where id = p_type),
          format('aaaaaaaa-0000-4000-8000-%s', lpad(to_hex(n), 12, '0'))::uuid,
          p_type, p_role, p_status, p_phase, p_coupon)
  returning * into r;
  return r;
end $$;

do $$
declare
  T  constant uuid := 'cccccccc-0000-4000-8000-000000000001';
  P1 constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  P2 constant uuid := 'dddddddd-0000-4000-8000-000000000002';
  r public.registrations;
  a record;
  msg text; code text;
begin
  -- 1. Fase activa correcta al inicio
  select * into a from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001')
   where ticket_phase_id = P1;
  perform pg_temp.assert(a.is_active and a.remaining = 2 and a.sold = 0, '1. Preventa activa con 2 cupos al inicio');
  perform pg_temp.assert(not (select is_active from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001') where ticket_phase_id = P2),
    '1b. Normal no está activa mientras haya preventa');

  -- 2. Cliente (authenticated) intenta forzar rol, estado y fase Normal
  perform pg_temp.as_user(1);
  r := pg_temp.reg(1, T, 'STAFF', 'CONFIRMED', P2);
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.ticket_phase_id = P1, '2a. Cliente no puede forzar la fase (recibe Preventa)');
  perform pg_temp.assert(r.event_role = 'ATTENDEE', '2b. Cliente no puede forzar el rol');
  perform pg_temp.assert(r.status = 'PENDING', '2c. Cliente no puede confirmar su pago (precio de fase 30 -> PENDING)');

  -- 3. Se llena la preventa -> el siguiente cae en Normal
  perform pg_temp.as_user(2);  r := pg_temp.reg(2, T);  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.ticket_phase_id = P1, '3a. Segundo cupo de preventa va a Preventa');
  select * into a from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001') where ticket_phase_id = P1;
  perform pg_temp.assert(a.remaining = 0 and not a.is_active, '3b. Preventa agotada (remaining 0, no activa)');
  perform pg_temp.as_user(3);  r := pg_temp.reg(3, T);  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.ticket_phase_id = P2 and r.status = 'PENDING', '3c. N+1 pasa a la fase Normal');
  perform pg_temp.assert((select is_active from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001') where ticket_phase_id = P2),
    '3d. Normal pasa a ser la fase activa');

  -- 4. CANCELLED libera cupo de la preventa
  perform pg_temp.as_admin();
  update public.registrations set status = 'CANCELLED' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  perform pg_temp.as_postgres();
  select * into a from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001') where ticket_phase_id = P1;
  perform pg_temp.assert(a.remaining = 1 and a.is_active, '4a. Cancelar libera el cupo y reactiva la Preventa');
  perform pg_temp.as_user(4);  r := pg_temp.reg(4, T);  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.ticket_phase_id = P1, '4b. El cupo liberado lo toma la Preventa');

  -- 5. Cupón de rol especial no consume cupo y funciona aun con fases llenas
  perform pg_temp.as_user(5);  r := pg_temp.reg(5, T);  perform pg_temp.as_postgres();   -- Normal 2/3
  perform pg_temp.as_user(6);  r := pg_temp.reg(6, T);  perform pg_temp.as_postgres();   -- Normal 3/3 (todo lleno)
  perform pg_temp.assert(r.ticket_phase_id = P2, '5a. Último cupo de Normal asignado');
  begin
    perform pg_temp.as_user(7);
    perform pg_temp.reg(7, T);
    perform pg_temp.as_postgres();
    raise exception 'FAIL: 5b. debió fallar con todas las fases llenas';
  exception when others then
    get stacked diagnostics msg = message_text;
    code := sqlstate;
    perform pg_temp.as_postgres();
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = 'P0010', format('5b. Todo lleno -> P0010 ("%s")', msg));
  end;
  perform pg_temp.as_user(8);
  r := pg_temp.reg(8, T, 'ATTENDEE', 'PENDING', null, 'eeeeeeee-0000-4000-8000-000000000001');
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.event_role = 'SPEAKER' and r.status = 'CONFIRMED', '5c. Cupón SPEAKER: rol y CONFIRMED desde el cupón, aun con todo lleno');
  perform pg_temp.assert(r.ticket_phase_id = P2, '5d. Cupón especial lleno queda en la última fase');
  select * into a from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001') where ticket_phase_id = P2;
  perform pg_temp.assert(a.sold = 3 and a.remaining = 0, '5e. El cupón especial no cuenta en sold');

  -- 6. Paquetes sin fases: igual que antes
  perform pg_temp.as_user(1);  r := pg_temp.reg(1, 'cccccccc-0000-4000-8000-000000000003', 'STAFF', 'PENDING', P1);
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.status = 'CONFIRMED' and r.event_role = 'ATTENDEE' and r.ticket_phase_id is null,
    '6a. Sin fases, gratis: CONFIRMED, ATTENDEE, fase ignorada (NULL)');
  perform pg_temp.as_user(2);  r := pg_temp.reg(2, 'cccccccc-0000-4000-8000-000000000002', 'ATTENDEE', 'CONFIRMED');
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.status = 'PENDING' and r.ticket_phase_id is null, '6b. Sin fases, de pago: PENDING con precio del paquete');
  perform pg_temp.as_user(9);  r := pg_temp.reg(9, 'cccccccc-0000-4000-8000-000000000002', 'STAFF', 'PENDING', null, 'eeeeeeee-0000-4000-8000-000000000002');
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.status = 'CONFIRMED' and r.event_role = 'ATTENDEE',
    '6c. Cupón ATTENDEE en paquete de pago: descuento total, CONFIRMED y ATTENDEE');
  perform pg_temp.as_user(3);  r := pg_temp.reg(3, 'cccccccc-0000-4000-8000-000000000002');
  perform pg_temp.as_postgres();
  perform pg_temp.assert(true, '6c. Sin fases: ticket_capacity no se aplica en servidor (comportamiento previo intacto)');

  -- 7. SUPERADMIN conserva lo enviado
  perform pg_temp.as_admin();
  r := pg_temp.reg(10, T, 'STAFF', 'CONFIRMED', P2);  -- el admin se registra a sí mismo (policy insert_own)
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.event_role = 'STAFF' and r.status = 'CONFIRMED' and r.ticket_phase_id = P2,
    '7a. SUPERADMIN conserva rol, estado y fase enviados');
  begin
    delete from public.registrations where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
    perform pg_temp.as_admin();
    perform pg_temp.reg(10, 'cccccccc-0000-4000-8000-000000000002', 'ATTENDEE', 'CONFIRMED', P1);
    perform pg_temp.as_postgres();
    raise exception 'FAIL: 7b. debió rechazar fase de otro paquete';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    perform pg_temp.as_postgres();
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = 'P0011', format('7b. Fase de otro paquete -> P0011 ("%s")', msg));
  end;
end $$;

-- 8. Protecciones de ticket_phases y RLS
do $$
declare
  T  constant uuid := 'cccccccc-0000-4000-8000-000000000001';
  P1 constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  msg text; code text;
begin
  begin  -- borrar fase con inscripciones
    delete from public.ticket_phases where id = P1;
    raise exception 'FAIL: 8a. debió impedir borrar fase con inscripciones';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = '23001', format('8a. Borrar fase con inscritos bloqueado ("%s")', msg));
  end;
  begin  -- bajar capacidad de la preventa por debajo de lo vendido (vendidos: 2)
    update public.ticket_phases set capacity = 1 where id = P1;
    raise exception 'FAIL: 8b. debió impedir bajar el cupo';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = '23001', format('8b. Bajar cupo bajo lo vendido bloqueado ("%s")', msg));
  end;
  update public.ticket_phases set capacity = 2 where id = P1;
  perform pg_temp.assert(true, '8c. Mantener/subir cupo permitido');
  begin  -- capacidad NULL en fase que no es la última
    update public.ticket_phases set capacity = null where id = P1;
    raise exception 'FAIL: 8d. debió exigir cupo salvo en la última fase';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = '23514', format('8d. Cupo NULL solo en la última fase ("%s")', msg));
  end;
  begin  -- fase paga sin QR
    insert into public.ticket_phases (ticket_type_id, name, position, price, capacity)
    values (T, 'Sin QR', 3, 10, 5);
    raise exception 'FAIL: 8e. debió exigir QR';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = '23514', '8e. Fase de pago sin QR rechazada (CHECK)');
  end;
  begin  -- posición duplicada
    insert into public.ticket_phases (ticket_type_id, name, position, price, capacity)
    values (T, 'Dup', 1, 0, 5);
    raise exception 'FAIL: 8f. debió rechazar position duplicada';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = '23505', '8f. position duplicada rechazada (UNIQUE)');
  end;
  -- fase sin inscritos se puede borrar y el paquete queda sin fase 3
  insert into public.ticket_phases (id, ticket_type_id, name, position, price, capacity)
    values ('dddddddd-0000-4000-8000-000000000003', T, 'Tmp', 3, 0, null);
  delete from public.ticket_phases where id = 'dddddddd-0000-4000-8000-000000000003';
  perform pg_temp.assert(true, '8g. Fase sin inscritos se puede crear y borrar');

  -- RLS: un asistente no escribe fases; anon/authenticated sí leen
  perform pg_temp.as_user(1);
  begin
    insert into public.ticket_phases (ticket_type_id, name, position, price, capacity)
    values (T, 'Hack', 9, 0, 1);
    raise exception 'FAIL: 8h. un asistente no debería poder insertar fases';
  exception when others then
    get stacked diagnostics msg = message_text; code := sqlstate;
    perform pg_temp.as_postgres();
    if msg like 'FAIL:%' then raise; end if;
    perform pg_temp.assert(code = '42501', format('8h. Asistente no puede escribir fases (RLS: %s)', msg));
  end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(1);
  perform pg_temp.assert((select count(*) from public.ticket_phases where ticket_type_id = T) = 2, '8i. Lectura de fases visible para authenticated');
  perform pg_temp.as_postgres();
end $$;

-- 9. get_ticket_availability: coherencia y acceso anon (sin datos de registros)
do $$
declare
  rows_total int; a record;
begin
  set local role anon;
  select count(*) into rows_total from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001');
  reset role;
  perform pg_temp.assert(rows_total = 2, '9a. anon puede llamar la RPC (2 filas: una por fase)');
  select sum(sold) into rows_total from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001')
   where ticket_type_id = 'cccccccc-0000-4000-8000-000000000001';
  perform pg_temp.assert(rows_total = (select count(*) from public.registrations
      where ticket_type_id = 'cccccccc-0000-4000-8000-000000000001' and event_role = 'ATTENDEE' and status in ('CONFIRMED','PENDING')),
    '9b. sold coincide con el conteo real de registrations (ATTENDEE, CONFIRMED|PENDING)');
  select * into a from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000002')
   where ticket_type_id = 'cccccccc-0000-4000-8000-000000000002';
  perform pg_temp.assert(a.ticket_phase_id is null and a.sold = 3 and a.remaining = 0 and a.price = 20,
    '9c. Paquete sin fases: una fila con ticket_phase_id NULL y datos del paquete');
  perform pg_temp.assert((select count(*) from public.get_ticket_availability('bbbbbbbb-0000-4000-8000-000000000001') where is_active and ticket_type_id = 'cccccccc-0000-4000-8000-000000000001') = 0,
    '9d. Paquete con todo lleno: ninguna fase activa');
end $$;

-- 10. Fase gratuita => CONFIRMED sin pago
do $$
declare r public.registrations; n int;
begin
  insert into public.ticket_types (id, event_id, name, price, ticket_capacity)
    values ('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'Gratis por fases', 0, 1);
  insert into public.ticket_phases (ticket_type_id, name, position, price, capacity)
    values ('cccccccc-0000-4000-8000-000000000004', 'Unica', 1, 0, 5);
  perform pg_temp.as_user(4);
  r := pg_temp.reg(4, 'cccccccc-0000-4000-8000-000000000004');
  perform pg_temp.as_postgres();
  perform pg_temp.assert(r.status = 'CONFIRMED', '10a. Fase gratuita => CONFIRMED');
  -- ticket_capacity del paquete (1) ya alcanzado -> el siguiente falla aunque la fase tenga cupo
  begin
    perform pg_temp.as_user(5);
    perform pg_temp.reg(5, 'cccccccc-0000-4000-8000-000000000004');
    perform pg_temp.as_postgres();
    raise exception 'FAIL: 10b. debió respetar ticket_capacity del paquete';
  exception when others then
    if sqlstate <> 'P0010' then perform pg_temp.as_postgres(); raise; end if;
    perform pg_temp.as_postgres();
    perform pg_temp.assert(true, '10b. ticket_capacity del paquete respetado (P0010)');
  end;
end $$;

rollback;
-- Verificación de residuos (fuera de la transacción): debe ser 0
select (select count(*) from public.events where slug like 'qa-%fases')
     + (select count(*) from auth.users where email like 'qa-%@test.local')
     + (select count(*) from public.ticket_phases where ticket_type_id::text like 'cccccccc-%') as residuos;
