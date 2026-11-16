---
name: database-and-features
description: Esquema de entidades de base de datos (Postgres/Supabase) y estructura de rutas/menús del sistema.
---

# Entidades de Base de Datos y Módulos del Sistema (Features & DB Schema)

Este documento centraliza el diseño lógico de las entidades de la base de datos de Supabase y el mapa de navegación/rutas por módulos del sistema.

---

## 1. Rutas y Módulos

Rutas reales del back-office (`src/app/app.routes.ts`, `features/events/events.routes.ts`):

| Ruta                    | Acceso                         | Descripción                                          |
| ----------------------- | ------------------------------ | ---------------------------------------------------- |
| `/dashboard`            | autenticado                    | Resumen.                                             |
| `/events`               | autenticado                    | Listado de eventos.                                  |
| `/events/new`           | SUPERADMIN (`superadminGuard`) | Wizard de creación.                                  |
| `/events/:id/edit`      | SUPERADMIN                     | Gestión por pestañas.                                |
| `/events/:id/attendees` | autenticado                    | Asistentes del evento.                               |
| `/checkin`              | autenticado                    | Check-in (STAFF solo en eventos asignados, por RLS). |

Los guards son solo UX; la seguridad real son las políticas RLS.

---

## 2. Esquema de Base de Datos

**Dueño del esquema: este repo (`supabase/migrations/`)**; eventos-gdg-tarija ya no guarda copia. Fuente de verdad: `supabase/migrations/20261024032707_baseline.sql` (`supabase db pull` de producción, 2026-10-24) + migraciones posteriores. Las migraciones anteriores se eliminaron (siguen en el historial de git de eventos-gdg-tarija (antes del 2026-10-24)). Lo que no se puede confirmar sin la BD remota se marca **por verificar**. No modificar la BD a mano: migración primero, luego actualizar este documento.

Convención: `updated_at` se mantiene con trigger `update_updated_at_column()` (events, staff_whitelist, users, sessions, ticket_types, ticket_phases, registrations, scan_logs, tracks, store_products, store_product_images, store_orders, store_order_items).

### 2.1. `sponsors`

`id` uuid PK, `name`, `description`, `score` text, `state` enum `state_enum` (`ACTIVE`|`INACTIVE`), `created_at`, `updated_at`. Ver `back.sql` (definición exacta por verificar).

### 2.2. `events`

| Columna                                                                               | Tipo         | Nulo | Notas                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                  | uuid         | NO   | PK                                                                                                                                              |
| `title`                                                                               | varchar(255) | NO   |                                                                                                                                                 |
| `slug`                                                                                | varchar(255) | NO   | UNIQUE (`events_slug_key`)                                                                                                                      |
| `event_type`                                                                          | varchar(20)  | NO   | CHECK: `MEETUP`, `CONFERENCE`, `HACKATHON`, `WORKSHOP`                                                                                          |
| `capacity`                                                                            | int4         | NO   |                                                                                                                                                 |
| `date_start`                                                                          | timestamptz  | NO   |                                                                                                                                                 |
| `date_end`                                                                            | timestamptz  | SÍ   |                                                                                                                                                 |
| `is_published`                                                                        | bool         | SÍ   | default `false`                                                                                                                                 |
| `description`, `image_url`, `banner_url`, `location_name`, `address_link`, `category` | text/varchar | SÍ   |                                                                                                                                                 |
| `location_type`                                                                       | varchar      | SÍ   | default `PHYSICAL`; CHECK `check_location_type`: `PHYSICAL`, `VIRTUAL`, `HYBRID`                                                                |
| `extra_info`                                                                          | jsonb        | SÍ   | default `{}`; contiene `form_fields` (array de `{key,label,type,required,placeholder?,options?}`; type: `text`, `number`, `checkbox`, `select`) |
| `created_at`, `updated_at`                                                            | timestamptz  | SÍ   |                                                                                                                                                 |

Trigger `trg_prevent_event_delete`: no se puede borrar un evento con inscripciones (usar despublicar).

`store_payment_qr_url` text NULL (migración `20261115235523`): QR de pago de la Tienda del evento (uno por evento, monto libre; CHECK no vacío). Sin QR no se pueden crear compras (ver 2.16).

### 2.3. `ticket_types`

`id`, `event_id` (FK events, ON DELETE CASCADE), `name` varchar(100), `price` numeric(10,2) default 0, `ticket_capacity` int4 NULL, `payment_qr_url`, `description`, `image_url`, `created_at`, `updated_at`.

- CHECK `check_qr_for_paid_tickets`: price = 0 => `payment_qr_url` NULL; price > 0 => QR no nulo ni vacío.
- UNIQUE (`event_id`, `name`).
- Si el paquete tiene **fases** (2.3.1), el precio/QR/cupo vigentes son los de la fase activa; `price`/`payment_qr_url` del paquete solo se usan en paquetes sin fases. `ticket_capacity` (total del paquete) se valida en el servidor **solo** en paquetes con fases.

### 2.3.1. `ticket_phases` (preventa por fases)

`id`, `ticket_type_id` (FK ticket_types, ON DELETE CASCADE), `name` varchar(100), `position` int (>= 1; UNIQUE por paquete, `DEFERRABLE INITIALLY IMMEDIATE`), `price` numeric(10,2) default 0, `capacity` int NULL (NULL = sin límite; > 0), `payment_qr_url`, `created_at`, `updated_at` (trigger).

- CHECK `check_qr_for_paid_phases`: igual que `check_qr_for_paid_tickets`.
- RLS: lectura pública (`public_read_ticket_phases`); escritura solo SUPERADMIN (`staff_write_ticket_phases`).
- Trigger `trg_validate_ticket_phase`: solo la última fase (mayor `position`) puede tener `capacity` NULL; no se puede cambiar de paquete ni bajar `capacity` por debajo de lo vendido.
- Trigger `trg_prevent_phase_delete` (+ FK RESTRICT): no se borra una fase con inscripciones.
- "Vendido" = registrations con `event_role = 'ATTENDEE'` y `status IN ('CONFIRMED','PENDING')` en esa fase (`CANCELLED` libera cupo; cupones de rol especial no consumen cupo). Helper interno `ticket_phase_sold(phase_id)` (sin grants a clientes).
- La fase activa es la primera por `position` con cupo libre. Paquete sin fases = comportamiento anterior (sin validación de cupo en servidor).

### 2.4. `tracks`

`id` uuid PK, `evento_id` (uuid NOT NULL; FK a events **por verificar**: `back.sql` solo declara la PK), `nombre` text NOT NULL, `descripcion` text NULL, `created_at` timestamptz NOT NULL, `updated_at` timestamptz NOT NULL (agregado en `20261022120000`, con trigger).

### 2.5. `sessions`

`id`, `event_id` (FK events, CASCADE), `title` varchar(255), `capacity` int4, `created_at`, `updated_at`, y por migraciones `005`/`008`/`012`:
`description` text, `track_id` uuid (FK tracks, ON DELETE SET NULL), `date` date, `start_time` time, `end_time` time, `speaker` text, `speaker_avatar_url` text, `city` text, `level` enum `session_level` (`Basico`|`Intermedio`|`Avanzado`), `topic` text (CSV, ej. `Kotlin,Android`).

- `time_slot` (smallint) fue agregada en `005` y revertida en `007`: **por verificar** que no exista en remoto.
- Existe un trigger de conflicto de horario (`010_session_datetime_conflict_trigger.sql`, afecta inscripción a sesiones); revisar su definición antes de tocar sesiones.
- Trigger `trg_prevent_session_delete`: no se borra una sesión con inscritos.

### 2.6. `event_coupons`

`id`, `event_id` (FK events, CASCADE), `code` varchar(50), `role` varchar(20) default `ATTENDEE` (CHECK: `ATTENDEE`, `SPEAKER`, `SPONSOR`, `STAFF`), `max_uses` int default 1, `created_at`, `updated_at`. UNIQUE (`event_id`, `code`).
Trigger `trg_process_registration_coupon` (BEFORE INSERT en registrations; único trigger de inserción, hace todo en orden): (1) valida cupón/evento/usos (P0002/P0003) y, si el rol no es ATTENDEE, fuerza `event_role` y `status = CONFIRMED`; (2) para usuarios no SUPERADMIN fuerza rol ATTENDEE; (3) asigna `ticket_phase_id` (ignora lo enviado; bloquea el paquete con `FOR NO KEY UPDATE` para serializar registros concurrentes), respeta `ticket_types.ticket_capacity` y el cupo de cada fase, y lanza **P0010** si todo está lleno (los roles especiales no consumen cupo ni fallan); SUPERADMIN/sin JWT puede enviar su fase (debe ser del paquete, si no **P0011**); (4) para no SUPERADMIN fija `status` = CONFIRMED si el precio de la fase asignada (o del paquete si no hay fases) es 0, si no PENDING. No usar `P0004` (es `assert_failure` y PL/pgSQL no lo atrapa con `WHEN OTHERS`).

### 2.7. `event_staff_assignments`

`id`, `event_id` (FK events, CASCADE), `staff_email` varchar, `assigned_at` timestamptz default now(). UNIQUE (`event_id`, `staff_email`). No tiene `created_at`/`updated_at` (excepción a la regla general).

- Policy `staff_read_own_assignments` (SELECT, corregida en `20261114171703`): `is_superadmin()` o `lower(staff_email) = lower(auth.jwt() ->> 'email')`. La versión original leía `auth.users` como `authenticated` (sin permiso) y fallaba con 42501 para todo STAFF; ahora cada STAFF lee solo sus asignaciones sin tocar `auth.users`. Escritura: solo SUPERADMIN.

### 2.8. `registrations`

`id`, `event_id` (FK, CASCADE), `user_id` (FK users, SET NULL, nullable), `ticket_type_id` (FK ticket_types, ON DELETE RESTRICT), `event_role` varchar(20) default `ATTENDEE` (CHECK `ATTENDEE|SPEAKER|SPONSOR|STAFF`), `status` varchar(20) (CHECK `PENDING|CONFIRMED|CANCELLED`), `custom_responses` jsonb, `payment_proof_url` text, `coupon_id` uuid (FK event_coupons, SET NULL), `ticket_phase_id` uuid NULL (FK ticket_phases, ON DELETE RESTRICT, indexada; la asigna el trigger, el cliente no la elige), `created_at`, `updated_at`. UNIQUE (`event_id`, `user_id`).

- `back.sql` declara default de `status` = `'REGISTERED'`, que viola el CHECK: **por verificar** el default real en remoto.
- Estados en el back-office (issue #7): `CONFIRMED` = pagada/confirmada, `PENDING` = pendiente de pago, `CANCELLED` = anulada. Solo SUPERADMIN los cambia (policy `staff_update_registrations`); el front envía solo `{ status }` (`RegistrationsApi`). Cualquier transición es válida, incluida restaurar una anulada. Dominio en `features/events/domain/registration-status.ts`.
- Una inscripción `CANCELLED` no registra asistencia: lo impide el trigger `trg_prevent_attendance_for_cancelled_registration` en `scan_logs` (ver 2.10). `PENDING` no lo bloquea la base; el check-in por QR exige `CONFIRMED` en la app.

### 2.9. `session_registrations`

PK compuesta (`registration_id` FK registrations CASCADE, `session_id` FK sessions CASCADE), `registered_at`. Sin `id`/`updated_at`. Lectura pública (cupos del checkout).

### 2.10. `scan_logs`

`id`, `registration_id` (FK registrations, CASCADE), `scanned_by` (FK users, SET NULL), `scan_type` varchar(30), `scanned_at`, `created_at`, `updated_at`.

- Valores usados por el código del back-office: `checkin`, `refrigerio`, `session`, `session_entry:<id>`.
- `back.sql` define un CHECK con valores distintos (`CHECK_IN_DOOR`, `SNACK_DAY_1`, `LUNCH_DAY_2`, `SWAG_DELIVERY`, `SESSION_IN`): **por verificar** el CHECK vigente en remoto (probablemente cambiado fuera de migraciones).
- UNIQUE (`registration_id`, `scan_type`): un mismo tipo de escaneo no se registra dos veces.
- Trigger `trg_prevent_attendance_for_cancelled_registration` (BEFORE INSERT o UPDATE de `registration_id`, migración `20261109031500`): rechaza (`P0001`) registrar asistencia de una inscripción `CANCELLED`, por cualquier camino (QR, manual, refrigerio, sesiones). Anular no borra los `scan_logs` previos.
- Policy `staff_delete_recent_own_scan_logs` (DELETE, migración `20261114171703`): solo para `get_my_role()` SUPERADMIN/STAFF con `has_event_access` sobre el evento de la inscripción, filas con `scanned_by = auth.uid()` y `scanned_at` de los últimos 60 s. Es el "Deshacer" del check-in móvil; no hay UPDATE.

### 2.11. `staff_whitelist`

`id`, `email` varchar(255) UNIQUE, `role` varchar(20) (CHECK `SUPERADMIN|STAFF`), `created_at`, `updated_at`. Fuente del rol del operador.

### 2.12. `users`

`id` (vínculo con auth.users), `email` UNIQUE, `first_name`, `last_name`, `avatar_url`, `phone`, `extra_info` jsonb, `is_staff` bool (**legacy**, ya no decide permisos), `created_at`, `updated_at`.

### 2.13. `inscripciones_sessions` (LEGACY)

`id`, `usuario_id`, `session_id` (FK sessions CASCADE), `inscrito_en`, `asistio`, `checked_in_at`. UNIQUE (`usuario_id`, `session_id`). Reemplazada por `session_registrations`; no usar en código nuevo.

### 2.14. Storage

- `event-assets`: público, límite 2 MB, MIME `image/jpeg|png|webp`. Lectura pública; insert/update/delete solo SUPERADMIN.
- `payment-proofs`: comprobantes de pago de asistentes (ruta `<event_id>/<user_id>/<timestamp>.<ext>`); políticas `payment_proofs_insert`/`payment_proofs_select` por bucket (`013`). Público y con inserción de `anon`: **no reutilizar** para datos nuevos.
- `store-images` (migración `20261115235523`): imágenes de productos de la Tienda. Público, 2 MB, `image/jpeg|png|webp`. Lectura pública; escritura solo SUPERADMIN.
- `store-payment-proofs` (migración `20261115235523`): comprobantes de compras de la Tienda. **Privado**, 5 MB, `image/jpeg|png|webp` y `application/pdf`. Ruta obligatoria `<user_id>/<event_id>/<archivo>`: el comprador solo sube a su carpeta de un evento donde tiene inscripción CONFIRMED o PENDING y solo lee lo suyo; SUPERADMIN lee todo; sin `anon`, sin UPDATE/DELETE de clientes. El back-office los muestra con URLs firmadas.
- Los buckets se crean por migración (producción no lee `config.toml`) y se reflejan en `supabase/config.toml` para local.

### 2.16. Tienda del evento (issue #6)

En la UI se llama **Tienda** (producto / compra) para no confundirla con los "paquetes" de entrada (`ticket_types`). Migración `20261115235523_store_products_orders.sql`; pruebas `supabase/tests/store.test.sql`.

- **`store_products`**: `id`, `event_id` (FK events, CASCADE), `name` varchar(100) (UNIQUE por evento sin distinguir mayúsculas), `description`, `price` numeric(10,2) (> 0), `is_active` (default true), `position` (orden del catálogo), `created_at`, `updated_at`. Trigger `trg_store_product_guard`: no se borra con **cualquier** compra, incluso anulada (`restrict_violation`; desactivar sí), ni cambia de evento.
- **`store_product_images`**: `id`, `product_id` (FK, CASCADE), `url`, `position` (UNIQUE por producto, `DEFERRABLE INITIALLY IMMEDIATE`; la menor es la portada), `alt_text` varchar(200), `created_at`, `updated_at`. Sin máximo de imágenes: los límites son por archivo (bucket).
- **`store_orders`** (compra): `id`, `event_id` (FK RESTRICT), `registration_id` (FK RESTRICT; debe ser del evento y del comprador), `user_id` (FK users, SET NULL), `status` (`PENDING|PAID|CANCELLED`, default PENDING), `total` (> 0, calculado por el servidor), `payment_proof_path` (ruta en `store-payment-proofs`, UNIQUE: un comprobante por compra), `reviewed_by`/`reviewed_at` (los fija la base de datos), `created_at`, `updated_at`.
- **`store_order_items`**: `id`, `order_id` (FK, CASCADE), `product_id` (FK RESTRICT), instantánea `product_name` y `unit_price`, `quantity` (1..5), `subtotal` (generada), y para la issue #9 `delivered_quantity` (0..quantity), `delivered_at`, `delivered_by`. UNIQUE (`order_id`, `product_id`). Instantánea inmutable; solo se entrega en compras PAID (P0035).
- **`store_order_status_history`**: `id` identity, `order_id` (FK, CASCADE), `from_status` (NULL en el alta), `to_status`, `reason`, `is_correction`, `changed_by` (sin FK a propósito), `changed_at`. Lo escribe solo el trigger `trg_log_store_order_status`; UPDATE/DELETE directos se rechazan (P0034).
- **Estados**: `PENDING -> PAID | CANCELLED`. Corrección excepcional `PAID | CANCELLED -> PENDING` solo SUPERADMIN, con motivo de 10 a 500 caracteres **dado en esa misma operación** (se pasa con `set_config('app.store_order_status_reason', ..., true)` dentro de `set_store_order_status` y se borra tras el UPDATE; nunca se reutiliza) y sin productos entregados (P0031). No se marca PAID si la inscripción está CANCELLED (P0032).
- **Coherencia** (constraint triggers diferidos): al confirmar, toda compra tiene al menos un ítem, productos del mismo evento y `total` = suma de subtotales (P0033). Compra e ítems deben insertarse en la misma transacción.
- **Concurrencia**: `create_store_order` bloquea `FOR SHARE` la inscripción y los productos (orden estable) hasta el commit, así precio y estado no cambian entre la validación y la instantánea; `set_store_order_status` toma `FOR UPDATE` sobre la compra y la entrega de un ítem (#9) toma `FOR SHARE` sobre su compra, de modo que una corrección y una entrega simultáneas se serializan.
- **RLS y privilegios**: productos/imágenes con lectura pública si el evento está publicado y el producto activo (SUPERADMIN ve todo); escritura solo SUPERADMIN. Compras/ítems: SELECT del comprador (`user_id = auth.uid()`) o SUPERADMIN. Historial: SELECT solo SUPERADMIN. Privilegios explícitos (se quita la ACL por defecto): `anon` solo SELECT en productos e imágenes; `authenticated` SELECT/INSERT/UPDATE/DELETE en productos e imágenes (RLS: SUPERADMIN) y solo SELECT en compras, ítems e historial; sin TRUNCATE, REFERENCES ni TRIGGER, ni acceso a la secuencia del historial. STAFF no ve compras (se habilitará en la issue #9).
- La migración aborta si `store-payment-proofs` ya existe como público. Las imágenes de `save_store_product` deben ser URLs `http(s)://`.
- Códigos de error propios: P0020 evento no disponible, P0021 tienda sin QR, P0022 sin inscripción activa, P0023 carrito inválido, P0024 producto no disponible, P0025 comprobante inválido, P0026 estado no válido, P0027 compra no encontrada, P0028 transición no permitida, P0029 dato inmutable, P0030 motivo inválido, P0031 hay entregas, P0032 inscripción anulada, P0033 compra inconsistente, P0034 historial inmutable, P0035 entrega sin pago, P0036 galería inválida.

### 2.15. Funciones

| Función                                                                                               | Descripción                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_my_role()`                                                                                       | Rol (`SUPERADMIN`/`STAFF`) del usuario actual vía `staff_whitelist` + `auth.users` (SECURITY DEFINER).                                                                                                                                                                                                                           |
| `is_superadmin()`                                                                                     | `get_my_role() = 'SUPERADMIN'`.                                                                                                                                                                                                                                                                                                  |
| `has_event_access(event_id)`                                                                          | SUPERADMIN o email asignado en `event_staff_assignments`.                                                                                                                                                                                                                                                                        |
| `validate_coupon(p_event_id, p_code)`                                                                 | RPC SECURITY DEFINER; devuelve `id, role, max_uses, uses_left` del cupón (case-insensitive). Solo `authenticated`.                                                                                                                                                                                                               |
| `get_coupon_uses(coupon_id)`                                                                          | Conteo de usos del cupón.                                                                                                                                                                                                                                                                                                        |
| `is_staff()`                                                                                          | Definida en `017`, usada por políticas no reescritas (p. ej. sponsors). Estado actual **por verificar**.                                                                                                                                                                                                                         |
| `get_ticket_availability(p_event_id)`                                                                 | RPC STABLE SECURITY DEFINER, `anon`+`authenticated`. Una fila por fase (`ticket_type_id, ticket_phase_id, name, position, price, payment_qr_url, capacity, sold, remaining, is_active, package_capacity, package_sold`); paquetes sin fases devuelven una fila con `ticket_phase_id` NULL. No expone inscripciones individuales. |
| `update_updated_at_column()`                                                                          | Trigger de `updated_at`.                                                                                                                                                                                                                                                                                                         |
| `prevent_attendance_for_cancelled_registration()`                                                     | Trigger de `scan_logs` (SECURITY INVOKER): bloquea asistencia de inscripciones `CANCELLED`.                                                                                                                                                                                                                                      |
| `create_store_order(p_event_id, p_items, p_payment_proof_path)`                                       | RPC SECURITY DEFINER, solo `authenticated`. Crea una compra PENDING del usuario actual: evento publicado con QR, inscripción CONFIRMED o PENDING, productos activos del evento, 1 a 5 unidades, sin repetidos, comprobante existente en su carpeta y no usado. Precio y total los fija el servidor. Devuelve el id.              |
| `set_store_order_status(p_order_id, p_status, p_reason)`                                              | RPC SECURITY DEFINER, solo SUPERADMIN. Único camino para cambiar el estado de una compra (ver 2.16). Devuelve la fila.                                                                                                                                                                                                           |
| `save_store_product(p_event_id, p_product_id, p_name, p_description, p_price, p_is_active, p_images)` | RPC SECURITY DEFINER, solo SUPERADMIN. Crea o actualiza un producto y reemplaza su galería (`[{url, alt_text}]` en orden) en una sola transacción. Devuelve el id.                                                                                                                                                               |

---

## 3. Flujo para Modificaciones de Base de Datos

1. **Definir la columna/tabla en este documento** antes de usarla en el código.
2. **Migración SQL** con `npm run db:new -- <nombre>` (crea `supabase/migrations/<timestamp>_<nombre>.sql`): PKs, FKs con `on delete` explícito, RLS habilitado. Probarla con `npm run db:reset` (local). Si toca RLS o triggers, agregar pruebas pgTAP en `supabase/tests/*.test.sql` (transacción + `rollback`, cambiando de rol con `set local role` y `request.jwt.claims`) y correrlas con `npm run db:test`.
3. **Regenerar tipos** (`npx supabase gen types typescript --local`) y actualizar `src/app/core/supabase/supabase.client.ts` en este repo y en eventos-gdg-tarija.
4. Ajustar menú/rutas si cambia la navegación.
5. **PR a `dev`** desde una rama de trabajo (nunca a `main`; el workflow `DB CI` re-aplica todas las migraciones) → en el release `dev → main`, `db-deploy-prod` aplica en prod tras aprobación manual. Si la migración toca datos existentes, antes hacer el ensayo con backup. Nunca aplicar migraciones en prod a mano (SQL Editor, MCP o `db push` local). Ver `docs/entornos-supabase.md`.

Migraciones pendientes, NO aplicadas en prod:

- `20261024155150_close_coupon_read_leak.sql` (elimina `authenticated_read_event_coupons`). Aplicar solo después de desplegar el checkout público que usa `rpc validate_coupon`.
- `20261024032944_tracks_event_fk.sql` (FK `tracks.evento_id → events.id`). Prod no tiene tracks huérfanos (verificado 2026-10-24).
- `20261109031500_block_attendance_for_cancelled_registrations.sql` (trigger en `scan_logs` que rechaza asistencia de inscripciones `CANCELLED`). Aditiva: no cambia policies ni datos; no afecta al sitio público (no escribe en `scan_logs`).
- `20261114171703_checkin_undo_scan.sql` (policy DELETE de `scan_logs` para deshacer un escaneo propio de los últimos 60 s, y corrección de `staff_read_own_assignments`, que fallaba para STAFF). No cambia datos ni restringe accesos.
- `20261115235523_store_products_orders.sql` (Tienda del evento, issue #6): tablas, RLS, RPC, triggers, columna `events.store_payment_qr_url` y buckets `store-images`/`store-payment-proofs`. Aditiva; debe salir antes que la compra en eventos-gdg-tarija (eventos#5). Confirmar en el DB CI que `db-deploy-prod` puede crear filas en `storage.buckets`.

---

## 4. Seguridad (RLS) y Roles

El rol del operador viene de `get_my_role()` (tabla `staff_whitelist`). `AUTH_WHITELIST` (`auth-whitelist.ts`) e `is_staff()` como mecanismo del back-office ya no existen: el front llama a `AuthService.resolveRole()` y los guards solo son UX.

| Rol                       | Permisos                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPERADMIN`              | Lee y escribe todo: events, ticket_types, tracks, sessions, event_coupons, event_staff_assignments, registrations (update), users, bucket `event-assets`, Tienda (productos, imágenes, revisión de compras vía RPC). |
| `STAFF`                   | Solo lectura y check-in (insert/select en `scan_logs`, y delete de su propio escaneo de los últimos 60 s) en eventos asignados (`has_event_access`); lee `users` de inscritos de esos eventos. No escribe eventos.   |
| Asistente (authenticated) | Lee eventos publicados, crea sus registrations, lee sus propios `scan_logs`.                                                                                                                                         |

Políticas relevantes: `public_read_published_events`, `staff_write_events` (solo superadmin), `staff_write_ticket_types`, `staff_write_ticket_phases`, `superadmin_write_tracks|sessions|event_coupons|assignments`, `select_own_or_staff_registrations`, `staff_select_scan_logs`/`staff_insert_scan_logs`/`staff_delete_recent_own_scan_logs`, `staff_select_users_for_assigned_events`.

**Regla crítica**: para dar acceso a un operador, agregar su email a `staff_whitelist` (migración/SQL con rol `SUPERADMIN` o `STAFF`) y, si es STAFF, asignarlo al evento en `event_staff_assignments`. Sin fila en `staff_whitelist`, `get_my_role()` devuelve NULL y no podrá operar.

Fuga conocida: `authenticated_read_event_coupons` (SELECT con `USING (true)`) deja que cualquier autenticado liste todos los códigos de cupón hasta aplicar `20261023120000_close_coupon_read_leak.sql`.

Antes de tocar políticas, correr los advisors de seguridad de Supabase contra el proyecto real; no asumir por el código local.
