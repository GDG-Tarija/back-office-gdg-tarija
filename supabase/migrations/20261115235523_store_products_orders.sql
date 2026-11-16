-- Tienda del evento (issue #6): productos (kits, merch, combos) con galería ordenada, compras con
-- varios productos y un comprobante, revisión manual del pago y campos de entrega por ítem
-- preparados para la issue #9. En la UI se llama "Tienda" (producto / compra) para no confundirla
-- con los "paquetes" de entrada (ticket_types).
--
-- Seguridad:
-- - Productos e imágenes: lectura pública solo si el evento está publicado y el producto activo;
--   escritura solo SUPERADMIN.
-- - Compras, ítems e historial: nadie escribe directo desde un cliente. Las compras se crean con
--   create_store_order() (precio, total y estado los fija el servidor) y cambian de estado con
--   set_store_order_status() (solo SUPERADMIN). El comprador ve solo lo suyo; SUPERADMIN, todo.
-- - Estados: PENDING -> PAID | CANCELLED. Corrección excepcional PAID | CANCELLED -> PENDING solo
--   con motivo dado en esa misma operación y sin productos entregados.
-- - Auditoría (reviewed_by/at e historial) la genera la base de datos; el historial es inmutable.
-- - Comprobantes en un bucket PRIVADO nuevo (store-payment-proofs). payment-proofs no se toca.
--
-- Códigos de error propios (SQLSTATE):
--   P0020 evento no disponible          P0028 cambio de estado no permitido
--   P0021 tienda sin QR de pago         P0029 dato inmutable
--   P0022 sin inscripción activa        P0030 motivo de corrección inválido
--   P0023 carrito inválido              P0031 la compra tiene productos entregados
--   P0024 producto no disponible        P0032 inscripción del comprador anulada
--   P0025 comprobante inválido          P0033 compra inconsistente (total, ítems o evento)
--   P0026 estado no válido              P0034 historial inmutable
--   P0027 compra no encontrada          P0035 entrega de una compra no pagada
--                                       P0036 galería inválida
-- (No usar P0004: es assert_failure.)

-- 1. QR de pago de la tienda: uno por evento, monto libre --------------------------------------
-- No existe un QR por evento reutilizable (solo hay QR por paquete de entrada y por fase).
alter table public.events add column store_payment_qr_url text;

alter table public.events add constraint events_store_payment_qr_url_check
  check (store_payment_qr_url is null or btrim(store_payment_qr_url) <> '');

comment on column public.events.store_payment_qr_url is
  'QR de pago de la Tienda del evento (monto libre). Sin QR no se pueden crear compras.';

-- 2. Tablas -------------------------------------------------------------------------------------
create table public.store_products (
  id          uuid                     not null default gen_random_uuid(),
  event_id    uuid                     not null,
  name        varchar(100)             not null,
  description text,
  price       numeric(10,2)            not null,
  is_active   boolean                  not null default true,
  position    integer                  not null default 1,
  created_at  timestamp with time zone not null default now(),
  updated_at  timestamp with time zone not null default now(),
  constraint store_products_pkey primary key (id),
  constraint store_products_event_id_fkey
    foreign key (event_id) references public.events(id) on delete cascade,
  constraint store_products_name_check check (btrim(name) <> ''),
  constraint store_products_price_check check (price > 0),
  constraint store_products_position_check check (position >= 1)
);

create unique index store_products_event_name_key
  on public.store_products (event_id, lower(btrim(name)));
create index store_products_event_position_idx on public.store_products (event_id, position);

comment on table public.store_products is
  'Productos de la Tienda de un evento (kits, merch, combos). No se borran si tienen compras.';

create table public.store_product_images (
  id         uuid                     not null default gen_random_uuid(),
  product_id uuid                     not null,
  url        text                     not null,
  position   integer                  not null,
  alt_text   varchar(200),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint store_product_images_pkey primary key (id),
  constraint store_product_images_product_id_fkey
    foreign key (product_id) references public.store_products(id) on delete cascade,
  -- DEFERRABLE: permite reordenar varias filas en un mismo comando sin choques transitorios.
  constraint store_product_images_position_key
    unique (product_id, position) deferrable initially immediate,
  constraint store_product_images_url_check check (btrim(url) <> ''),
  constraint store_product_images_position_check check (position >= 1)
);

comment on table public.store_product_images is
  'Galería ordenada de un producto; la de menor position es la portada.';

create table public.store_orders (
  id                 uuid                     not null default gen_random_uuid(),
  event_id           uuid                     not null,
  registration_id    uuid                     not null,
  user_id            uuid,
  status             varchar(20)              not null default 'PENDING',
  total              numeric(10,2)            not null,
  payment_proof_path text                     not null,
  reviewed_by        uuid,
  reviewed_at        timestamp with time zone,
  created_at         timestamp with time zone not null default now(),
  updated_at         timestamp with time zone not null default now(),
  constraint store_orders_pkey primary key (id),
  constraint store_orders_event_id_fkey
    foreign key (event_id) references public.events(id) on delete restrict,
  constraint store_orders_registration_id_fkey
    foreign key (registration_id) references public.registrations(id) on delete restrict,
  constraint store_orders_user_id_fkey
    foreign key (user_id) references public.users(id) on delete set null,
  constraint store_orders_reviewed_by_fkey
    foreign key (reviewed_by) references public.users(id) on delete set null,
  constraint store_orders_status_check check (status in ('PENDING', 'PAID', 'CANCELLED')),
  constraint store_orders_total_check check (total > 0),
  constraint store_orders_payment_proof_path_check check (btrim(payment_proof_path) <> '')
);

-- Un comprobante respalda una sola compra.
create unique index store_orders_payment_proof_path_key on public.store_orders (payment_proof_path);
create index store_orders_event_status_idx on public.store_orders (event_id, status, created_at desc);
create index store_orders_user_id_idx on public.store_orders (user_id);
create index store_orders_registration_id_idx on public.store_orders (registration_id);

comment on table public.store_orders is
  'Compras de la Tienda. Se crean con create_store_order() y cambian de estado con set_store_order_status().';
comment on column public.store_orders.payment_proof_path is
  'Ruta del comprobante en el bucket privado store-payment-proofs (<user_id>/<event_id>/...).';
comment on column public.store_orders.reviewed_by is
  'Último SUPERADMIN que cambió el estado (lo fija la base de datos).';

create table public.store_order_items (
  id                 uuid                     not null default gen_random_uuid(),
  order_id           uuid                     not null,
  product_id         uuid                     not null,
  product_name       varchar(100)             not null,
  unit_price         numeric(10,2)            not null,
  quantity           integer                  not null,
  subtotal           numeric(10,2)            generated always as (unit_price * quantity) stored,
  delivered_quantity integer                  not null default 0,
  delivered_at       timestamp with time zone,
  delivered_by       uuid,
  created_at         timestamp with time zone not null default now(),
  updated_at         timestamp with time zone not null default now(),
  constraint store_order_items_pkey primary key (id),
  constraint store_order_items_order_id_fkey
    foreign key (order_id) references public.store_orders(id) on delete cascade,
  -- RESTRICT: un producto con cualquier compra (incluso anulada) no se borra; se desactiva.
  constraint store_order_items_product_id_fkey
    foreign key (product_id) references public.store_products(id) on delete restrict,
  constraint store_order_items_delivered_by_fkey
    foreign key (delivered_by) references public.users(id) on delete set null,
  constraint store_order_items_order_product_key unique (order_id, product_id),
  constraint store_order_items_unit_price_check check (unit_price > 0),
  constraint store_order_items_quantity_check check (quantity between 1 and 5),
  constraint store_order_items_delivered_check check (delivered_quantity between 0 and quantity)
);

create index store_order_items_product_id_idx on public.store_order_items (product_id);

comment on table public.store_order_items is
  'Ítems de una compra con instantánea de nombre y precio. delivered_* se usa en la issue #9.';

create table public.store_order_status_history (
  id            bigint generated always as identity,
  order_id      uuid                     not null,
  from_status   varchar(20),
  to_status     varchar(20)              not null,
  reason        text,
  is_correction boolean                  not null default false,
  -- Sin FK a propósito: la auditoría se conserva aunque el usuario se elimine.
  changed_by    uuid,
  changed_at    timestamp with time zone not null default now(),
  constraint store_order_status_history_pkey primary key (id),
  constraint store_order_status_history_order_id_fkey
    foreign key (order_id) references public.store_orders(id) on delete cascade
);

create index store_order_status_history_order_idx
  on public.store_order_status_history (order_id, changed_at);

comment on table public.store_order_status_history is
  'Historial inmutable de estados de cada compra; lo escribe solo el trigger trg_log_store_order_status.';

-- updated_at
create trigger update_store_products_updated_at
  before update on public.store_products
  for each row execute function public.update_updated_at_column();
create trigger update_store_product_images_updated_at
  before update on public.store_product_images
  for each row execute function public.update_updated_at_column();
create trigger update_store_orders_updated_at
  before update on public.store_orders
  for each row execute function public.update_updated_at_column();
create trigger update_store_order_items_updated_at
  before update on public.store_order_items
  for each row execute function public.update_updated_at_column();

-- 3. Productos: no se borran con compras ni cambian de evento ------------------------------------
create or replace function public.store_product_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.store_order_items i where i.product_id = old.id) then
      raise exception 'No se puede eliminar el producto "%": tiene compras. Desactívalo en su lugar.', old.name
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  if new.event_id <> old.event_id then
    raise exception 'Un producto no puede cambiar de evento.' using errcode = 'P0029';
  end if;
  return new;
end;
$function$;

create trigger trg_store_product_guard
  before update or delete on public.store_products
  for each row execute function public.store_product_guard();

-- 4. Compras: alta, integridad, transiciones y auditoría ---------------------------------------
-- Motivo de la transición: lo fija set_store_order_status() con set_config(..., is_local => true)
-- justo antes del UPDATE y lo borra justo después, así nunca se reutiliza un motivo anterior.
-- Los clientes no pueden fijarlo: PostgREST no expone set_config() y no hay UPDATE directo.
create or replace function public.store_order_status_reason()
returns text
language sql
stable
set search_path to 'public'
as $function$
  select nullif(btrim(coalesce(current_setting('app.store_order_status_reason', true), '')), '');
$function$;

create or replace function public.store_orders_before_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reg_event uuid;
  v_reg_user  uuid;
begin
  select r.event_id, r.user_id into v_reg_event, v_reg_user
    from public.registrations r
   where r.id = new.registration_id;

  if not found or v_reg_event <> new.event_id then
    raise exception 'La inscripción no corresponde al evento de la compra.' using errcode = 'P0033';
  end if;

  if new.user_id is null then
    new.user_id := v_reg_user;
  elsif new.user_id is distinct from v_reg_user then
    raise exception 'La compra debe pertenecer al titular de la inscripción.' using errcode = 'P0033';
  end if;

  -- Con sesión de cliente (incluido el RPC), una compra siempre nace pendiente y sin revisión.
  if auth.uid() is not null then
    new.status      := 'PENDING';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$function$;

create trigger trg_store_orders_before_insert
  before insert on public.store_orders
  for each row execute function public.store_orders_before_insert();

create or replace function public.store_orders_before_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reason     text := public.store_order_status_reason();
  v_correction boolean;
begin
  -- user_id/reviewed_by solo pueden pasar a NULL (FK ON DELETE SET NULL al borrar el usuario).
  if new.event_id <> old.event_id
     or new.registration_id <> old.registration_id
     or new.total <> old.total
     or new.payment_proof_path <> old.payment_proof_path
     or new.created_at is distinct from old.created_at
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception 'Los datos de una compra no se pueden modificar.' using errcode = 'P0029';
  end if;

  if new.status = old.status then
    if new.reviewed_at is distinct from old.reviewed_at
       or (new.reviewed_by is distinct from old.reviewed_by and new.reviewed_by is not null) then
      raise exception 'La revisión de una compra la registra la base de datos.' using errcode = 'P0029';
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.is_superadmin() then
    raise exception 'Solo un SUPERADMIN puede cambiar el estado de una compra.' using errcode = '42501';
  end if;

  v_correction := old.status in ('PAID', 'CANCELLED') and new.status = 'PENDING';

  if not ((old.status = 'PENDING' and new.status in ('PAID', 'CANCELLED')) or v_correction) then
    raise exception 'Cambio de estado no permitido: % -> %.', old.status, new.status
      using errcode = 'P0028';
  end if;

  if v_correction then
    if v_reason is null or char_length(v_reason) not between 10 and 500 then
      raise exception 'Indica el motivo de la corrección (10 a 500 caracteres).' using errcode = 'P0030';
    end if;
    if exists (
      select 1 from public.store_order_items i
       where i.order_id = old.id and i.delivered_quantity > 0
    ) then
      raise exception 'No se puede corregir: la compra ya tiene productos entregados.'
        using errcode = 'P0031';
    end if;
  elsif v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'El motivo no puede superar 500 caracteres.' using errcode = 'P0030';
  end if;

  if new.status = 'PAID' and exists (
    select 1 from public.registrations r
     where r.id = old.registration_id and r.status = 'CANCELLED'
  ) then
    raise exception 'No se puede marcar pagada: la inscripción del comprador está anulada.'
      using errcode = 'P0032';
  end if;

  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$function$;

create trigger trg_store_orders_before_update
  before update on public.store_orders
  for each row execute function public.store_orders_before_update();

create or replace function public.log_store_order_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_from       varchar(20);
  v_reason     text;
  v_correction boolean := false;
begin
  -- Ramas explícitas: OLD no existe en INSERT y SQL no garantiza el orden de evaluación de AND.
  if tg_op = 'UPDATE' then
    if new.status = old.status then
      return null;
    end if;
    v_from       := old.status;
    v_reason     := public.store_order_status_reason();
    v_correction := old.status in ('PAID', 'CANCELLED') and new.status = 'PENDING';
  end if;

  insert into public.store_order_status_history
    (order_id, from_status, to_status, reason, is_correction, changed_by)
  values (new.id, v_from, new.status, v_reason, v_correction, auth.uid());
  return null;
end;
$function$;

create trigger trg_log_store_order_status
  after insert or update of status on public.store_orders
  for each row execute function public.log_store_order_status();

-- Historial inmutable. Solo se admite el borrado en cascada (lo ejecuta el trigger de la FK,
-- por eso pg_trigger_depth() > 1); un DELETE o UPDATE directo se rechaza.
create or replace function public.protect_store_order_history()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'El historial de estados de una compra no se puede modificar.' using errcode = 'P0034';
end;
$function$;

create trigger trg_protect_store_order_history
  before update or delete on public.store_order_status_history
  for each row execute function public.protect_store_order_history();

-- 5. Ítems: instantánea inmutable; la entrega (issue #9) solo sobre compras pagadas ------------
create or replace function public.store_order_items_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    -- Con sesión de cliente, un ítem nace sin entregas.
    if auth.uid() is not null then
      new.delivered_quantity := 0;
      new.delivered_at       := null;
      new.delivered_by       := null;
    end if;
    return new;
  end if;

  if new.order_id <> old.order_id
     or new.product_id <> old.product_id
     or new.product_name <> old.product_name
     or new.unit_price <> old.unit_price
     or new.quantity <> old.quantity
     or new.created_at is distinct from old.created_at then
    raise exception 'Los productos de una compra no se pueden modificar.' using errcode = 'P0029';
  end if;

  if new.delivered_quantity > old.delivered_quantity then
    -- FOR SHARE: se serializa con set_store_order_status (FOR UPDATE), así una corrección
    -- concurrente no deja entregas en una compra que dejó de estar pagada.
    perform 1 from public.store_orders o where o.id = new.order_id and o.status = 'PAID' for share;
    if not found then
      raise exception 'Solo se entregan productos de compras pagadas.' using errcode = 'P0035';
    end if;
  end if;
  return new;
end;
$function$;

create trigger trg_store_order_items_guard
  before insert or update on public.store_order_items
  for each row execute function public.store_order_items_guard();

-- Coherencia al confirmar la transacción: al menos un ítem, productos del mismo evento y total
-- igual a la suma de subtotales. Diferido porque la compra se inserta antes que sus ítems.
create or replace function public.check_store_order_consistency()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_event_id uuid;
  v_total    numeric(10,2);
  v_items    integer;
  v_sum      numeric(10,2);
  v_foreign  integer;
begin
  if tg_table_name = 'store_orders' then
    v_order_id := new.id; -- este constraint trigger solo existe para INSERT en store_orders
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select o.event_id, o.total into v_event_id, v_total
    from public.store_orders o
   where o.id = v_order_id;
  if not found then
    return null; -- la compra se eliminó en la misma transacción (cascada)
  end if;

  select count(*), coalesce(sum(i.subtotal), 0), count(*) filter (where p.event_id <> v_event_id)
    into v_items, v_sum, v_foreign
    from public.store_order_items i
    join public.store_products p on p.id = i.product_id
   where i.order_id = v_order_id;

  if v_items = 0 then
    raise exception 'Una compra debe tener al menos un producto.' using errcode = 'P0033';
  end if;
  if v_foreign > 0 then
    raise exception 'Todos los productos deben ser del evento de la compra.' using errcode = 'P0033';
  end if;
  if v_sum <> v_total then
    raise exception 'El total de la compra (%) no coincide con sus productos (%).', v_total, v_sum
      using errcode = 'P0033';
  end if;
  return null;
end;
$function$;

create constraint trigger trg_check_store_order_consistency
  after insert on public.store_orders
  deferrable initially deferred
  for each row execute function public.check_store_order_consistency();

create constraint trigger trg_check_store_order_items_consistency
  after insert or update or delete on public.store_order_items
  deferrable initially deferred
  for each row execute function public.check_store_order_consistency();

-- 6. RPC: crear una compra (la usará eventos-gdg-tarija, issue eventos#5) ----------------------
-- Compra quien tiene una inscripción CONFIRMED o PENDING en el evento (nunca CANCELLED). Precio,
-- total y estado los fija el servidor; el comprobante debe estar en la carpeta del comprador.
create or replace function public.create_store_order(
  p_event_id           uuid,
  p_items              jsonb,
  p_payment_proof_path text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid             uuid := auth.uid();
  v_published       boolean;
  v_qr              text;
  v_registration_id uuid;
  v_path            text := btrim(coalesce(p_payment_proof_path, ''));
  v_prefix          text;
  v_count           integer;
  v_distinct        integer;
  v_valid           integer;
  v_total           numeric(10,2);
  v_order_id        uuid;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para comprar en la tienda.' using errcode = '42501';
  end if;

  select e.is_published, e.store_payment_qr_url into v_published, v_qr
    from public.events e
   where e.id = p_event_id;
  if not found or not coalesce(v_published, false) then
    raise exception 'El evento no está disponible para compras.' using errcode = 'P0020';
  end if;
  if v_qr is null then
    raise exception 'La tienda de este evento no está habilitada.' using errcode = 'P0021';
  end if;

  -- UNIQUE (event_id, user_id) en registrations: hay a lo sumo una. FOR SHARE: no se anula
  -- mientras se crea la compra.
  select r.id into v_registration_id
    from public.registrations r
   where r.event_id = p_event_id
     and r.user_id = v_uid
     and r.status in ('CONFIRMED', 'PENDING')
     for share;
  if v_registration_id is null then
    raise exception 'Necesitas una inscripción activa en el evento para comprar.' using errcode = 'P0022';
  end if;

  -- Comprobaciones separadas: SQL no garantiza el orden de evaluación de OR.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Agrega al menos un producto.' using errcode = 'P0023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto.' using errcode = 'P0023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(jsonb_typeof(e -> 'quantity'), '') <> 'number'
        or coalesce(e ->> 'quantity', '') !~ '^[1-5]$'
  ) then
    raise exception 'Cada producto debe indicar una cantidad entre 1 y 5.' using errcode = 'P0023';
  end if;

  select count(*), count(distinct (e ->> 'product_id')::uuid)
    into v_count, v_distinct
    from jsonb_array_elements(p_items) e;
  if v_distinct <> v_count then
    raise exception 'No repitas un producto en la misma compra; usa la cantidad.' using errcode = 'P0023';
  end if;

  -- Bloquea los productos (orden estable) hasta el final de la transacción: precio y estado no
  -- cambian entre la validación y la instantánea de los ítems.
  perform 1
     from public.store_products p
    where p.id in (select (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e)
    order by p.id
      for share;

  select count(*), sum(p.price * (e ->> 'quantity')::integer)
    into v_valid, v_total
    from jsonb_array_elements(p_items) e
    join public.store_products p on p.id = (e ->> 'product_id')::uuid
   where p.event_id = p_event_id
     and p.is_active;
  if v_valid <> v_count then
    raise exception 'Uno de los productos ya no está disponible.' using errcode = 'P0024';
  end if;

  v_prefix := v_uid::text || '/' || p_event_id::text || '/';
  if v_path = ''
     or left(v_path, length(v_prefix)) <> v_prefix
     or length(v_path) = length(v_prefix)
     or position('..' in v_path) > 0 then
    raise exception 'Sube el comprobante de pago de esta compra.' using errcode = 'P0025';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'store-payment-proofs' and o.name = v_path
  ) then
    raise exception 'No encontramos el comprobante subido. Vuelve a subirlo.' using errcode = 'P0025';
  end if;
  if exists (select 1 from public.store_orders o where o.payment_proof_path = v_path) then
    raise exception 'Ese comprobante ya se usó en otra compra.' using errcode = 'P0025';
  end if;

  insert into public.store_orders (event_id, registration_id, user_id, total, payment_proof_path)
  values (p_event_id, v_registration_id, v_uid, v_total, v_path)
  returning id into v_order_id;

  insert into public.store_order_items (order_id, product_id, product_name, unit_price, quantity)
  select v_order_id, p.id, p.name, p.price, (e ->> 'quantity')::integer
    from jsonb_array_elements(p_items) e
    join public.store_products p on p.id = (e ->> 'product_id')::uuid
   where p.event_id = p_event_id
     and p.is_active;

  return v_order_id;
end;
$function$;

comment on function public.create_store_order(uuid, jsonb, text) is
  'Crea una compra PENDING del usuario actual. p_items: [{"product_id": uuid, "quantity": 1..5}].';

-- 7. RPC: cambiar el estado de una compra (solo SUPERADMIN) ------------------------------------
create or replace function public.set_store_order_status(
  p_order_id uuid,
  p_status   text,
  p_reason   text default null
)
returns public.store_orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status  text := upper(btrim(coalesce(p_status, '')));
  v_current text;
  v_row     public.store_orders;
begin
  if not public.is_superadmin() then
    raise exception 'Solo un SUPERADMIN puede revisar compras.' using errcode = '42501';
  end if;
  if v_status not in ('PENDING', 'PAID', 'CANCELLED') then
    raise exception 'Estado de compra no válido.' using errcode = 'P0026';
  end if;

  select o.status into v_current from public.store_orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'La compra no existe.' using errcode = 'P0027';
  end if;
  if v_current = v_status then
    raise exception 'La compra ya está en ese estado.' using errcode = 'P0028';
  end if;

  -- El motivo vive solo durante este UPDATE (ver store_order_status_reason()).
  perform set_config('app.store_order_status_reason', coalesce(btrim(p_reason), ''), true);
  update public.store_orders set status = v_status where id = p_order_id returning * into v_row;
  perform set_config('app.store_order_status_reason', '', true);

  return v_row;
end;
$function$;

comment on function public.set_store_order_status(uuid, text, text) is
  'SUPERADMIN: PENDING -> PAID | CANCELLED, o corrección PAID | CANCELLED -> PENDING con motivo (10-500).';

-- 8. RPC: guardar un producto y su galería de forma atómica (solo SUPERADMIN) ------------------
-- p_images: [{"url": text, "alt_text": text|null}] en el orden final (el primero es la portada).
create or replace function public.save_store_product(
  p_event_id    uuid,
  p_product_id  uuid,
  p_name        text,
  p_description text,
  p_price       numeric,
  p_is_active   boolean,
  p_images      jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Solo un SUPERADMIN puede gestionar la tienda.' using errcode = '42501';
  end if;

  -- Sin esta comprobación la FK daría 23503, que el front interpreta como "tiene inscritos".
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    raise exception 'El evento no existe.' using errcode = 'P0020';
  end if;

  if char_length(coalesce(btrim(p_name), '')) not between 1 and 100 then
    raise exception 'El nombre del producto es obligatorio (máximo 100 caracteres).'
      using errcode = 'check_violation';
  end if;
  if p_price is null or p_price <= 0 or p_price <> round(p_price, 2) then
    raise exception 'El precio debe ser mayor que 0 y tener como máximo 2 decimales.'
      using errcode = 'check_violation';
  end if;

  -- Comprobaciones separadas: SQL no garantiza el orden de evaluación de OR.
  if p_images is null or jsonb_typeof(p_images) <> 'array' then
    raise exception 'La galería del producto no es válida.' using errcode = 'P0036';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_images) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(jsonb_typeof(e -> 'url'), '') <> 'string'
        or coalesce(btrim(e ->> 'url'), '') !~* '^https?://[^[:space:]]+$'
        or (e ? 'alt_text' and jsonb_typeof(e -> 'alt_text') not in ('string', 'null'))
        or char_length(coalesce(e ->> 'alt_text', '')) > 200
  ) then
    raise exception 'La galería del producto no es válida.' using errcode = 'P0036';
  end if;
  if (select count(*) <> count(distinct btrim(e ->> 'url')) from jsonb_array_elements(p_images) e) then
    raise exception 'La galería tiene imágenes repetidas.' using errcode = 'P0036';
  end if;

  if p_product_id is null then
    insert into public.store_products (event_id, name, description, price, is_active, position)
    values (
      p_event_id,
      btrim(p_name),
      nullif(btrim(p_description), ''),
      p_price,
      coalesce(p_is_active, true),
      coalesce((select max(sp.position) from public.store_products sp where sp.event_id = p_event_id), 0) + 1
    )
    returning id into v_id;
  else
    update public.store_products
       set name        = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           price       = p_price,
           is_active   = coalesce(p_is_active, is_active)
     where id = p_product_id
       and event_id = p_event_id
    returning id into v_id;
    if v_id is null then
      raise exception 'El producto no existe en este evento.' using errcode = 'P0024';
    end if;
  end if;

  delete from public.store_product_images where product_id = v_id;
  insert into public.store_product_images (product_id, url, position, alt_text)
  select v_id, btrim(t.e ->> 'url'), t.ord::integer, nullif(btrim(t.e ->> 'alt_text'), '')
    from jsonb_array_elements(p_images) with ordinality as t(e, ord);

  return v_id;
end;
$function$;

comment on function public.save_store_product(uuid, uuid, text, text, numeric, boolean, jsonb) is
  'SUPERADMIN: crea o actualiza un producto y reemplaza su galería en una sola transacción.';

-- 9. Privilegios de funciones (por defecto Supabase da EXECUTE a anon y authenticated) ----------
revoke all on function public.store_product_guard() from public, anon, authenticated;
revoke all on function public.store_order_status_reason() from public, anon, authenticated;
revoke all on function public.store_orders_before_insert() from public, anon, authenticated;
revoke all on function public.store_orders_before_update() from public, anon, authenticated;
revoke all on function public.log_store_order_status() from public, anon, authenticated;
revoke all on function public.protect_store_order_history() from public, anon, authenticated;
revoke all on function public.store_order_items_guard() from public, anon, authenticated;
revoke all on function public.check_store_order_consistency() from public, anon, authenticated;

revoke all on function public.create_store_order(uuid, jsonb, text) from public, anon;
revoke all on function public.set_store_order_status(uuid, text, text) from public, anon;
revoke all on function public.save_store_product(uuid, uuid, text, text, numeric, boolean, jsonb)
  from public, anon;
grant execute on function public.create_store_order(uuid, jsonb, text) to authenticated;
grant execute on function public.set_store_order_status(uuid, text, text) to authenticated;
grant execute on function public.save_store_product(uuid, uuid, text, text, numeric, boolean, jsonb)
  to authenticated;

-- 10. RLS y privilegios de tablas ----------------------------------------------------------------
alter table public.store_products enable row level security;
alter table public.store_product_images enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.store_order_status_history enable row level security;

-- Privilegios mínimos explícitos (la ACL por defecto de Supabase da todo, incluido TRUNCATE, que no
-- pasa por RLS). Compras, ítems e historial no se escriben desde clientes: solo vía RPC y triggers,
-- que corren como propietario. anon no tiene nada que leer en compras.
revoke all on public.store_products, public.store_product_images,
              public.store_orders, public.store_order_items, public.store_order_status_history
  from anon, authenticated;
revoke all on sequence public.store_order_status_history_id_seq from anon, authenticated;

grant select on public.store_products, public.store_product_images to anon;
grant select, insert, update, delete on public.store_products, public.store_product_images
  to authenticated;
grant select on public.store_orders, public.store_order_items, public.store_order_status_history
  to authenticated;

create policy "public_read_store_products" on public.store_products
  for select to public
  using (
    public.is_superadmin()
    or (
      is_active
      and exists (
        select 1 from public.events e
         where e.id = store_products.event_id and e.is_published = true
      )
    )
  );

create policy "superadmin_write_store_products" on public.store_products
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- La subconsulta respeta la RLS de store_products: solo imágenes de productos visibles.
create policy "public_read_store_product_images" on public.store_product_images
  for select to public
  using (
    exists (select 1 from public.store_products p where p.id = store_product_images.product_id)
  );

create policy "superadmin_write_store_product_images" on public.store_product_images
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "select_own_or_superadmin_store_orders" on public.store_orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

-- La subconsulta respeta la RLS de store_orders.
create policy "select_visible_store_order_items" on public.store_order_items
  for select to authenticated
  using (exists (select 1 from public.store_orders o where o.id = store_order_items.order_id));

create policy "superadmin_read_store_order_status_history" on public.store_order_status_history
  for select to authenticated
  using (public.is_superadmin());

-- 11. Storage --------------------------------------------------------------------------------------
-- Producción no lee config.toml: los buckets se crean aquí (idempotente) y se reflejan en local.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('store-images', 'store-images', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('store-payment-proofs', 'store-payment-proofs', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Si el bucket de comprobantes ya existía como público, abortar: no se expone por error.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'store-payment-proofs' and public) then
    raise exception 'El bucket store-payment-proofs existe y es público; debe ser privado.';
  end if;
end $$;

-- Imágenes de productos: lectura pública, escritura solo SUPERADMIN (igual que event-assets).
create policy "store_images_public_read" on storage.objects
  for select to public
  using (bucket_id = 'store-images');

create policy "store_images_superadmin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-images' and public.is_superadmin());

create policy "store_images_superadmin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-images' and public.is_superadmin())
  with check (bucket_id = 'store-images' and public.is_superadmin());

create policy "store_images_superadmin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-images' and public.is_superadmin());

-- Comprobantes de compras (bucket privado): cada comprador sube solo a <su uid>/<evento>/ de un
-- evento donde tiene inscripción activa, y lee solo lo suyo; SUPERADMIN lee todos. Sin anon,
-- sin UPDATE ni DELETE de clientes (el comprobante de una compra no se reemplaza).
create policy "store_proofs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.registrations r
       where r.user_id = auth.uid()
         and r.event_id::text = (storage.foldername(name))[2]
         and r.status in ('CONFIRMED', 'PENDING')
    )
  );

create policy "store_proofs_select_own_or_superadmin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin())
  );
