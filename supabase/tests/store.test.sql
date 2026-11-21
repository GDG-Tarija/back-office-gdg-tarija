-- Tienda del evento (issue #6): RLS, RPC, transiciones de estado, auditoría, borrado de productos
-- y storage.
--
-- Corre contra el Supabase LOCAL: `npm run db:test`. Todo ocurre en una transacción con ROLLBACK
-- y con datos ficticios propios (prefijo 57000000-...), sin depender del seed.
-- Las restricciones diferidas (coherencia total = ítems) se fuerzan con `set constraints all immediate`.
--
-- Actores: SA = SUPERADMIN, ST = STAFF asignado a E1, U1 = inscrito CONFIRMED en E1,
-- U2 = inscrito PENDING en E1, U3 = inscripción CANCELLED en E1, U4 = sin inscripción.
-- Eventos: E1 publicado con QR, E2 publicado sin QR, E3 sin publicar con QR.

begin;

create extension if not exists pgtap with schema extensions;

select plan(117);

-- ---------------------------------------------------------------------------
-- Fixture (como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'superadmin@store-test.test'),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'staff@store-test.test'),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'u1@store-test.test'),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'u2@store-test.test'),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'u3@store-test.test'),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000b4', 'authenticated', 'authenticated', 'u4@store-test.test');

insert into public.staff_whitelist (email, role) values
  ('superadmin@store-test.test', 'SUPERADMIN'),
  ('staff@store-test.test',      'STAFF');

insert into public.events (id, title, slug, event_type, capacity, date_start, is_published, store_payment_qr_url) values
  ('57000000-0000-4000-8000-0000000000e1', 'Tienda test E1', 'tienda-test-e1', 'MEETUP', 50, now() + interval '7 days', true,  'https://ejemplo.test/qr-e1.png'),
  ('57000000-0000-4000-8000-0000000000e2', 'Tienda test E2', 'tienda-test-e2', 'MEETUP', 50, now() + interval '7 days', true,  null),
  ('57000000-0000-4000-8000-0000000000e3', 'Tienda test E3', 'tienda-test-e3', 'MEETUP', 50, now() + interval '7 days', false, 'https://ejemplo.test/qr-e3.png');

insert into public.ticket_types (id, event_id, name, price) values
  ('57000000-0000-4000-8000-0000000000f1', '57000000-0000-4000-8000-0000000000e1', 'Entrada test', 0),
  ('57000000-0000-4000-8000-0000000000f2', '57000000-0000-4000-8000-0000000000e2', 'Entrada test', 0),
  ('57000000-0000-4000-8000-0000000000f3', '57000000-0000-4000-8000-0000000000e3', 'Entrada test', 0);

insert into public.event_staff_assignments (event_id, staff_email)
values ('57000000-0000-4000-8000-0000000000e1', 'staff@store-test.test');

insert into public.registrations (id, event_id, user_id, ticket_type_id, status) values
  ('57000000-0000-4000-8000-000000000101', '57000000-0000-4000-8000-0000000000e1', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000f1', 'CONFIRMED'),
  ('57000000-0000-4000-8000-000000000102', '57000000-0000-4000-8000-0000000000e1', '57000000-0000-4000-8000-0000000000b2', '57000000-0000-4000-8000-0000000000f1', 'PENDING'),
  ('57000000-0000-4000-8000-000000000103', '57000000-0000-4000-8000-0000000000e1', '57000000-0000-4000-8000-0000000000b3', '57000000-0000-4000-8000-0000000000f1', 'CANCELLED'),
  ('57000000-0000-4000-8000-000000000107', '57000000-0000-4000-8000-0000000000e2', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000f2', 'CONFIRMED'),
  ('57000000-0000-4000-8000-000000000108', '57000000-0000-4000-8000-0000000000e3', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000f3', 'CONFIRMED');

insert into public.store_products (id, event_id, name, price, is_active, position) values
  ('57000000-0000-4000-8000-000000000201', '57000000-0000-4000-8000-0000000000e1', 'Kit',      80.00, true,  1),
  ('57000000-0000-4000-8000-000000000202', '57000000-0000-4000-8000-0000000000e1', 'Polera',   60.00, true,  2),
  ('57000000-0000-4000-8000-000000000203', '57000000-0000-4000-8000-0000000000e1', 'Taza',     35.00, false, 3),
  ('57000000-0000-4000-8000-000000000204', '57000000-0000-4000-8000-0000000000e2', 'Kit E2',   10.00, true,  1),
  ('57000000-0000-4000-8000-000000000205', '57000000-0000-4000-8000-0000000000e3', 'Kit E3',   10.00, true,  1),
  ('57000000-0000-4000-8000-000000000206', '57000000-0000-4000-8000-0000000000e1', 'Stickers', 25.00, true,  4);

insert into public.store_product_images (product_id, url, position) values
  ('57000000-0000-4000-8000-000000000201', 'https://ejemplo.test/kit.png',  1),
  ('57000000-0000-4000-8000-000000000203', 'https://ejemplo.test/taza.png', 1),
  ('57000000-0000-4000-8000-000000000205', 'https://ejemplo.test/e3.png',   1);

-- Comprobantes "subidos" (filas de storage.objects en el bucket privado)
insert into storage.objects (bucket_id, name, owner) values
  ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-1.png', '57000000-0000-4000-8000-0000000000b1'),
  ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png', '57000000-0000-4000-8000-0000000000b1'),
  ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e2/proof-1.png', '57000000-0000-4000-8000-0000000000b1'),
  ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e3/proof-1.png', '57000000-0000-4000-8000-0000000000b1'),
  ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b2/57000000-0000-4000-8000-0000000000e1/proof-1.png', '57000000-0000-4000-8000-0000000000b2');

-- ---------------------------------------------------------------------------
-- 1. Buckets y privilegios (1-10)
-- ---------------------------------------------------------------------------
select ok((select public from storage.buckets where id = 'store-images'), 'store-images es público');
select ok(not (select public from storage.buckets where id = 'store-payment-proofs'), 'store-payment-proofs es privado');
select ok(not has_function_privilege('anon', 'public.create_store_order(uuid, jsonb, text)', 'execute'), 'anon no ejecuta create_store_order');
select ok(not has_function_privilege('anon', 'public.set_store_order_status(uuid, text, text)', 'execute'), 'anon no ejecuta set_store_order_status');
select ok(has_function_privilege('authenticated', 'public.create_store_order(uuid, jsonb, text)', 'execute'), 'authenticated ejecuta create_store_order');
select ok(not has_function_privilege('authenticated', 'public.store_orders_before_update()', 'execute'), 'funciones de trigger sin EXECUTE para clientes');
select ok(not has_table_privilege('authenticated', 'public.store_orders', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated no escribe store_orders directo');
select ok(
  not has_table_privilege('authenticated', 'public.store_order_items', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated', 'public.store_order_status_history', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated', 'public.store_products', 'TRUNCATE,REFERENCES,TRIGGER'),
  'privilegios mínimos en tablas de la tienda (sin TRUNCATE, REFERENCES ni TRIGGER)');
select ok(
  not has_sequence_privilege('authenticated', 'public.store_order_status_history_id_seq', 'USAGE,UPDATE')
  and not has_sequence_privilege('anon', 'public.store_order_status_history_id_seq', 'USAGE,UPDATE'),
  'clientes sin acceso a la secuencia del historial');
select ok(
  not has_table_privilege('anon', 'public.store_orders', 'SELECT')
  and has_table_privilege('anon', 'public.store_products', 'SELECT')
  and not has_table_privilege('anon', 'public.store_products', 'INSERT,UPDATE,DELETE'),
  'anon solo lee el catálogo');

-- ---------------------------------------------------------------------------
-- 2. Productos e imágenes: lectura (11-14)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select results_eq(
  $$ select id::text from public.store_products where name in ('Kit', 'Polera', 'Taza', 'Kit E2', 'Kit E3', 'Stickers') order by id $$,
  $$ values ('57000000-0000-4000-8000-000000000201'), ('57000000-0000-4000-8000-000000000202'),
            ('57000000-0000-4000-8000-000000000204'), ('57000000-0000-4000-8000-000000000206') $$,
  'anon ve solo productos activos de eventos publicados');
select results_eq(
  $$ select url from public.store_product_images where url like 'https://ejemplo.test/%' order by url $$,
  $$ values ('https://ejemplo.test/kit.png') $$,
  'anon ve solo imágenes de productos visibles');
select throws_ok(
  $$ insert into public.store_products (event_id, name, price) values ('57000000-0000-4000-8000-0000000000e1', 'Hack', 1) $$,
  '42501', null, 'anon no crea productos');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ select 1 from public.store_products where id = '57000000-0000-4000-8000-000000000203' $$,
  'SUPERADMIN ve productos inactivos');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Productos: escritura (15-32)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.store_products (event_id, name, price) values ('57000000-0000-4000-8000-0000000000e1', 'Hack', 1) $$,
  '42501', null, 'usuario sin rol no crea productos');
select is_empty(
  $$ update public.store_products set price = 1 where id = '57000000-0000-4000-8000-000000000201' returning id $$,
  'usuario sin rol no edita productos');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'Hack', null, 1, true, '[]') $$,
  '42501', null, 'usuario sin rol no usa save_store_product');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ update public.store_products set price = 1 where id = '57000000-0000-4000-8000-000000000201' returning id $$,
  'STAFF no edita productos');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'Hack', null, 1, true, '[]') $$,
  '42501', null, 'STAFF no usa save_store_product');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, '  Gorra  ', 'Gorra bordada', 45.50, true,
       '[{"url": "https://ejemplo.test/gorra-1.png", "alt_text": "Frente"}, {"url": "https://ejemplo.test/gorra-2.png"}]') $$,
  'SUPERADMIN crea un producto con galería');
select results_eq(
  $$ select i.url, i.position from public.store_product_images i
       join public.store_products p on p.id = i.product_id
      where p.name = 'Gorra' order by i.position $$,
  $$ values ('https://ejemplo.test/gorra-1.png', 1), ('https://ejemplo.test/gorra-2.png', 2) $$,
  'la galería se guarda en orden y el nombre sin espacios');
select lives_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1',
       (select id from public.store_products where name = 'Gorra'), 'Gorra', null, 45.50, true,
       '[{"url": "https://ejemplo.test/gorra-2.png"}, {"url": "https://ejemplo.test/gorra-1.png"}]') $$,
  'SUPERADMIN reordena la galería');
select results_eq(
  $$ select i.url from public.store_product_images i join public.store_products p on p.id = i.product_id
      where p.name = 'Gorra' and i.position = 1 $$,
  $$ values ('https://ejemplo.test/gorra-2.png') $$,
  'la nueva portada es la primera imagen');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'Llavero', null, 5, true,
       '[{"url": "https://ejemplo.test/x.png"}, {"url": "https://ejemplo.test/x.png"}]') $$,
  'P0056', null, 'galería con imágenes repetidas: rechazada');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'Llavero', null, 5, true, '{"url": "x"}') $$,
  'P0056', null, 'galería que no es lista: rechazada');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'Llavero', null, 5, true,
       '[{"url": "javascript:alert(1)"}]') $$,
  'P0056', null, 'imagen con URL que no es http(s): rechazada');
select throws_ok(
  $$ select public.save_store_product(gen_random_uuid(), null, 'Llavero', null, 5, true, '[]') $$,
  'P0040', null, 'evento inexistente: rechazado con mensaje claro');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'Llavero', null, 0, true, '[]') $$,
  '23514', null, 'precio 0: rechazado');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, '   ', null, 5, true, '[]') $$,
  '23514', null, 'nombre vacío: rechazado');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e1', null, 'KIT', null, 5, true, '[]') $$,
  '23505', null, 'nombre repetido en el evento (sin distinguir mayúsculas): rechazado');
select throws_ok(
  $$ select public.save_store_product('57000000-0000-4000-8000-0000000000e2',
       '57000000-0000-4000-8000-000000000201', 'Kit', null, 80, true, '[]') $$,
  'P0044', null, 'no se edita un producto desde otro evento');
reset role;

select throws_ok(
  $$ update public.store_products set event_id = '57000000-0000-4000-8000-0000000000e2'
      where id = '57000000-0000-4000-8000-000000000201' $$,
  'P0049', null, 'un producto no cambia de evento');

-- ---------------------------------------------------------------------------
-- 4. create_store_order (33-55)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 1}]', 'x') $$,
  '42501', null, 'anon no compra');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 2},
         {"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-1.png') $$,
  'U1 (inscripción CONFIRMED) compra 2 Kit + 1 Polera');
select results_eq(
  $$ select status::text, total from public.store_orders
      where payment_proof_path like '%b1/57000000-0000-4000-8000-0000000000e1/proof-1.png' $$,
  $$ values ('PENDING'::text, 220.00::numeric) $$,
  'la compra nace PENDING con total calculado por el servidor');
select results_eq(
  $$ select i.product_name::text, i.unit_price, i.quantity, i.subtotal, i.delivered_quantity
       from public.store_order_items i join public.store_orders o on o.id = i.order_id
      where o.payment_proof_path like '%b1/57000000-0000-4000-8000-0000000000e1/proof-1.png' order by i.product_name $$,
  $$ values ('Kit'::text, 80.00::numeric, 2, 160.00::numeric, 0), ('Polera'::text, 60.00::numeric, 1, 60.00::numeric, 0) $$,
  'ítems con instantánea de nombre y precio, sin entregas');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 6}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0043', null, 'cantidad 6: rechazada');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 0}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0043', null, 'cantidad 0: rechazada');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": "2"}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0043', null, 'cantidad como texto: rechazada');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 1},
         {"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0043', null, 'producto repetido: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1', '[]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0043', null, 'carrito vacío: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000203", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0044', null, 'producto inactivo: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000204", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'P0044', null, 'producto de otro evento: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b2/57000000-0000-4000-8000-0000000000e1/proof-1.png') $$,
  'P0045', null, 'comprobante de otro usuario: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/no-existe.png') $$,
  'P0045', null, 'comprobante inexistente en storage: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-1.png') $$,
  'P0045', null, 'comprobante ya usado en otra compra: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]', '') $$,
  'P0045', null, 'sin comprobante: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e2',
       '[{"product_id": "57000000-0000-4000-8000-000000000204", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e2/proof-1.png') $$,
  'P0041', null, 'evento sin QR de tienda: rechazado');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e3',
       '[{"product_id": "57000000-0000-4000-8000-000000000205", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e3/proof-1.png') $$,
  'P0040', null, 'evento sin publicar: rechazado');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b3", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]', 'x') $$,
  'P0042', null, 'inscripción CANCELLED: no compra');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b4", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]', 'x') $$,
  'P0042', null, 'sin inscripción: no compra');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select lives_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000202", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b2/57000000-0000-4000-8000-0000000000e1/proof-1.png') $$,
  'U2 (inscripción PENDING) puede comprar');
reset role;

select lives_ok($$ set constraints all immediate $$, 'compras coherentes (total = ítems) al confirmar');
set constraints all deferred;

update public.store_products set price = 999 where id = '57000000-0000-4000-8000-000000000201';
select is(
  (select i.unit_price from public.store_order_items i where i.product_id = '57000000-0000-4000-8000-000000000201'),
  80.00::numeric,
  'cambiar el precio del producto no altera compras anteriores');

select results_eq(
  $$ select from_status::text, to_status::text, is_correction from public.store_order_status_history h
       join public.store_orders o on o.id = h.order_id
      where o.payment_proof_path like '%b1/57000000-0000-4000-8000-0000000000e1/proof-1.png' $$,
  $$ values (null::text, 'PENDING'::text, false) $$,
  'el alta queda en el historial');

-- ---------------------------------------------------------------------------
-- 5. Visibilidad y escritura directa de compras (56-63)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select results_eq(
  $$ select count(*)::int from public.store_orders $$, $$ values (1) $$,
  'U1 ve solo su compra');
select throws_ok(
  $$ insert into public.store_orders (event_id, registration_id, total, payment_proof_path)
     values ('57000000-0000-4000-8000-0000000000e1', '57000000-0000-4000-8000-000000000101', 1, 'x') $$,
  '42501', null, 'U1 no inserta compras directo');
select throws_ok(
  $$ update public.store_orders set status = 'PAID' $$,
  '42501', null, 'U1 no actualiza su compra');
select is_empty($$ select 1 from public.store_order_status_history $$, 'U1 no lee el historial');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.store_order_items i join public.store_orders o on o.id = i.order_id
      where o.user_id = '57000000-0000-4000-8000-0000000000b1' $$,
  'U2 no ve ítems de U1');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty($$ select 1 from public.store_orders $$, 'STAFF no ve compras (se habilitará en la issue #9)');
select is_empty($$ select 1 from public.store_order_status_history $$, 'STAFF no lee el historial');
reset role;

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok($$ select 1 from public.store_orders $$, '42501', null, 'anon no tiene acceso a compras');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Estados: flujo normal, corrección, auditoría (64-85)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PAID') $$,
  '42501', null, 'el comprador no marca su compra como pagada');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_store_order_status(gen_random_uuid(), 'PAID') $$,
  '42501', null, 'STAFF no revisa compras');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'REFUNDED') $$,
  'P0046', null, 'estado desconocido: rechazado');
select throws_ok(
  $$ select public.set_store_order_status(gen_random_uuid(), 'PAID') $$,
  'P0047', null, 'compra inexistente: rechazada');
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING') $$,
  'P0048', null, 'mismo estado: rechazado');
select lives_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PAID') $$,
  'SUPERADMIN: PENDING -> PAID');
select results_eq(
  $$ select status::text, reviewed_by::text, reviewed_at is not null from public.store_orders
      where user_id = '57000000-0000-4000-8000-0000000000b1' $$,
  $$ values ('PAID'::text, '57000000-0000-4000-8000-0000000000a1'::text, true) $$,
  'la base de datos registra quién y cuándo revisó');
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'CANCELLED') $$,
  'P0048', null, 'PAID -> CANCELLED directo: rechazado');
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING') $$,
  'P0050', null, 'corrección sin motivo: rechazada');
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING', ' error ') $$,
  'P0050', null, 'corrección con motivo corto: rechazada');
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING', repeat('x', 501)) $$,
  'P0050', null, 'corrección con motivo de más de 500 caracteres: rechazada');
select lives_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING',
       'Se validó por error el comprobante de otra persona') $$,
  'SUPERADMIN corrige PAID -> PENDING con motivo');
select results_eq(
  $$ select from_status::text, to_status::text, reason, is_correction, changed_by::text
       from public.store_order_status_history h join public.store_orders o on o.id = h.order_id
      where o.user_id = '57000000-0000-4000-8000-0000000000b1' order by h.id desc limit 1 $$,
  $$ values ('PAID'::text, 'PENDING'::text, 'Se validó por error el comprobante de otra persona'::text, true,
             '57000000-0000-4000-8000-0000000000a1'::text) $$,
  'la corrección queda en el historial con motivo y autor');
select lives_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'CANCELLED') $$,
  'flujo normal sin motivo: PENDING -> CANCELLED');
select is(
  (select reason from public.store_order_status_history h join public.store_orders o on o.id = h.order_id
    where o.user_id = '57000000-0000-4000-8000-0000000000b1' order by h.id desc limit 1),
  null::text,
  'el motivo de la corrección anterior no se arrastra a la transición siguiente');
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING') $$,
  'P0050', null, 'nueva corrección sin motivo: rechazada (no reutiliza el anterior)');
select lives_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING',
       'El comprador demostró que sí pagó') $$,
  'SUPERADMIN corrige CANCELLED -> PENDING con motivo');
select lives_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PAID') $$,
  'y vuelve a marcarla pagada');
reset role;

-- Inscripción anulada: no se marca pagada; sí se anula.
update public.registrations set status = 'CANCELLED' where id = '57000000-0000-4000-8000-000000000102';
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b2'), 'PAID') $$,
  'P0052', null, 'no se marca pagada si la inscripción del comprador está anulada');
select lives_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b2'), 'CANCELLED',
       'Inscripción anulada') $$,
  'esa compra sí se puede anular');
reset role;

-- Escrituras directas (como postgres): la base de datos sigue imponiendo las reglas.
select throws_ok(
  $$ update public.store_orders set total = 1 where user_id = '57000000-0000-4000-8000-0000000000b1' $$,
  'P0049', null, 'el total no se modifica');
select throws_ok(
  $$ update public.store_orders set status = 'PENDING' where user_id = '57000000-0000-4000-8000-0000000000b1' $$,
  'P0050', null, 'una corrección directa sin motivo de la operación se rechaza');

-- ---------------------------------------------------------------------------
-- 7. Entregas (issue #9), ítems e historial inmutables (86-93)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.store_order_items i set delivered_quantity = 1
       from public.store_orders o
      where o.id = i.order_id and o.user_id = '57000000-0000-4000-8000-0000000000b2' $$,
  'P0055', null, 'no se entregan productos de una compra no pagada');
select lives_ok(
  $$ update public.store_order_items i set delivered_quantity = 1
       from public.store_orders o
      where o.id = i.order_id and o.user_id = '57000000-0000-4000-8000-0000000000b1'
        and i.product_name = 'Kit' $$,
  'se registra una entrega parcial en una compra pagada');
select throws_ok(
  $$ update public.store_order_items i set delivered_quantity = 3
       from public.store_orders o
      where o.id = i.order_id and o.user_id = '57000000-0000-4000-8000-0000000000b1'
        and i.product_name = 'Kit' $$,
  '23514', null, 'no se entrega más de lo comprado');

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_store_order_status(
       (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1'), 'PENDING',
       'Intento de corregir después de entregar') $$,
  'P0051', null, 'no se corrige una compra con productos entregados');
reset role;

select throws_ok(
  $$ update public.store_order_items set quantity = 5 where product_name = 'Polera'
       and order_id = (select id from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b1') $$,
  'P0049', null, 'los ítems de una compra no se modifican');
select throws_ok(
  $$ update public.store_order_status_history set reason = 'manipulado' $$,
  'P0054', null, 'el historial no se edita');
select throws_ok(
  $$ delete from public.store_order_status_history $$,
  'P0054', null, 'el historial no se borra directo');
select lives_ok(
  $$ delete from public.store_orders where user_id = '57000000-0000-4000-8000-0000000000b2' $$,
  'borrar una compra (solo postgres) arrastra su historial en cascada');

-- ---------------------------------------------------------------------------
-- 8. Borrado de productos (94-98)
-- ---------------------------------------------------------------------------
-- Compra de "Stickers" que luego se anula: incluso así el producto no se puede borrar.
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000206", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/proof-2.png') $$,
  'U1 compra Stickers');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_store_order_status(
       (select o.id from public.store_orders o join public.store_order_items i on i.order_id = o.id
         where i.product_id = '57000000-0000-4000-8000-000000000206'), 'CANCELLED') $$,
  'SUPERADMIN anula la compra de Stickers');
select throws_ok(
  $$ delete from public.store_products where id = '57000000-0000-4000-8000-000000000206' $$,
  '23001', null, 'producto con una compra anulada: no se borra');
select isnt_empty(
  $$ update public.store_products set is_active = false where id = '57000000-0000-4000-8000-000000000206' returning id $$,
  'producto con compras: sí se desactiva');
select lives_ok(
  $$ delete from public.store_products where name = 'Gorra' $$,
  'producto sin compras: se borra (con su galería)');
reset role;

-- ---------------------------------------------------------------------------
-- 9. Storage (99-106)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/anon.png') $$,
  '42501', null, 'anon no sube comprobantes');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/nuevo.png',
        '57000000-0000-4000-8000-0000000000b1') $$,
  'U1 sube un comprobante a su carpeta del evento');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b2/57000000-0000-4000-8000-0000000000e1/ajeno.png') $$,
  '42501', null, 'U1 no sube a la carpeta de otro usuario');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('store-images', 'events/57000000-0000-4000-8000-0000000000e1/store/hack.png') $$,
  '42501', null, 'U1 no sube imágenes de productos');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b4", "role": "authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b4/57000000-0000-4000-8000-0000000000e1/x.png') $$,
  '42501', null, 'sin inscripción no se suben comprobantes');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'store-payment-proofs'
       and name like '57000000-0000-4000-8000-0000000000b1/%' $$,
  'U2 no lee comprobantes de U1');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'store-payment-proofs' $$,
  'STAFF no lee comprobantes de compras');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ select 1 from storage.objects where bucket_id = 'store-payment-proofs'
       and name like '57000000-0000-4000-8000-0000000000b1/%' $$,
  'SUPERADMIN lee los comprobantes');
reset role;

-- ---------------------------------------------------------------------------
-- 10. Anti-spam, limpieza de comprobantes y auditoría (107-117)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e3/x.png') $$,
  '42501', null, 'no se suben comprobantes a un evento sin publicar');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e2/x.png') $$,
  '42501', null, 'no se suben comprobantes a un evento sin QR de tienda');
reset role;

-- La Storage API borra con storage.allow_delete_query = true (si no, storage.protect_delete lo
-- impide) y como el rol del usuario: así se prueban las policies de borrado.
set local storage.allow_delete_query to 'true';

-- Llena la carpeta de U1 en E1 hasta 9 archivos (como postgres).
insert into storage.objects (bucket_id, name, owner)
select 'store-payment-proofs',
       '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/relleno-' || g || '.png',
       '57000000-0000-4000-8000-0000000000b1'
  from generate_series(1, 9 - (
    select count(*) from storage.objects
     where bucket_id = 'store-payment-proofs'
       and name like '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/%')) g;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/decimo.png',
        '57000000-0000-4000-8000-0000000000b1') $$,
  'el décimo comprobante del evento se acepta');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values
       ('store-payment-proofs', '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/once.png',
        '57000000-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'el comprobante 11 del mismo evento se rechaza');
select is_empty(
  $$ delete from storage.objects where bucket_id = 'store-payment-proofs'
       and name = '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/relleno-1.png'
     returning 1 $$,
  'el comprador no borra sus comprobantes');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ delete from storage.objects where bucket_id = 'store-payment-proofs'
       and name = '57000000-0000-4000-8000-0000000000b1/57000000-0000-4000-8000-0000000000e1/relleno-1.png'
     returning 1 $$,
  'SUPERADMIN borra un comprobante que ninguna compra usa');
select is_empty(
  $$ delete from storage.objects where bucket_id = 'store-payment-proofs'
       and name in (select payment_proof_path from public.store_orders)
     returning 1 $$,
  'SUPERADMIN no borra comprobantes de compras');
reset role;

-- Tope de compras PENDING por inscripción: U5, inscrito en E1, con 4 comprobantes.
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000b5', 'authenticated', 'authenticated', 'u5@store-test.test');
insert into public.registrations (id, event_id, user_id, ticket_type_id, status) values
  ('57000000-0000-4000-8000-000000000109', '57000000-0000-4000-8000-0000000000e1', '57000000-0000-4000-8000-0000000000b5', '57000000-0000-4000-8000-0000000000f1', 'CONFIRMED');
insert into storage.objects (bucket_id, name, owner)
select 'store-payment-proofs',
       '57000000-0000-4000-8000-0000000000b5/57000000-0000-4000-8000-0000000000e1/p' || g || '.png',
       '57000000-0000-4000-8000-0000000000b5'
  from generate_series(1, 4) g;

set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000b5", "role": "authenticated"}';
select lives_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b5/57000000-0000-4000-8000-0000000000e1/p' || g || '.png')
       from generate_series(1, 3) g $$,
  'tres compras en revisión se aceptan');
select throws_ok(
  $$ select public.create_store_order('57000000-0000-4000-8000-0000000000e1',
       '[{"product_id": "57000000-0000-4000-8000-000000000201", "quantity": 1}]',
       '57000000-0000-4000-8000-0000000000b5/57000000-0000-4000-8000-0000000000e1/p4.png') $$,
  'P0057', null, 'la cuarta compra en revisión se rechaza');
reset role;

-- Auditoría: los cambios de productos aparecen en Actividad (categoría CONFIG).
set local role authenticated;
set local request.jwt.claims to '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
update public.store_products set price = 65.00 where id = '57000000-0000-4000-8000-000000000202';
select is(
  (select count(*)::int from public.audit_log
    where table_name = 'store_products' and record_id = '57000000-0000-4000-8000-000000000202'
      and action = 'UPDATE' and event_id = '57000000-0000-4000-8000-0000000000e1'
      and changes -> 'price' = '[60.00, 65.00]'::jsonb),
  1, 'el cambio de precio de un producto queda auditado con su evento');
select is(
  (select subject_name from public.list_audit_log(
      p_event_id => '57000000-0000-4000-8000-0000000000e1', p_category => 'CONFIG')
    where table_name = 'store_products' and action = 'UPDATE' limit 1),
  'Polera', 'Actividad lista el producto en Configuración con su nombre');
reset role;

select * from finish();

rollback;
