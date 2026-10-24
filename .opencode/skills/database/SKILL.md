---
name: database-and-features
description: Esquema de entidades de base de datos (Postgres/Supabase) y estructura de rutas/menús del sistema.
---

# Entidades de Base de Datos y Módulos del Sistema (Features & DB Schema)

Este documento centraliza el diseño lógico de las entidades de la base de datos de Supabase y el mapa de navegación/rutas por módulos del sistema.

---

## 1. Rutas y Módulos

Rutas reales del back-office (`src/app/app.routes.ts`, `features/events/events.routes.ts`):

| Ruta | Acceso | Descripción |
| --- | --- | --- |
| `/dashboard` | autenticado | Resumen. |
| `/events` | autenticado | Listado de eventos. |
| `/events/new` | SUPERADMIN (`superadminGuard`) | Wizard de creación. |
| `/events/:id/edit` | SUPERADMIN | Gestión por pestañas. |
| `/events/:id/attendees` | autenticado | Asistentes del evento. |
| `/checkin` | autenticado | Check-in (STAFF solo en eventos asignados, por RLS). |

Los guards son solo UX; la seguridad real son las políticas RLS.

---

## 2. Esquema de Base de Datos

**Dueño del esquema: este repo (`supabase/migrations/`)**; eventos-gdg-tarija ya no guarda copia. Fuente de verdad: `supabase/migrations/20261024032707_baseline.sql` (`supabase db pull` de producción, 2026-10-24) + migraciones posteriores. Las migraciones anteriores se eliminaron (siguen en el historial de git de eventos-gdg-tarija (antes del 2026-10-24)). Lo que no se puede confirmar sin la BD remota se marca **por verificar**. No modificar la BD a mano: migración primero, luego actualizar este documento.

Convención: `updated_at` se mantiene con trigger `update_updated_at_column()` (events, staff_whitelist, users, sessions, ticket_types, registrations, scan_logs, tracks).

### 2.1. `sponsors`
`id` uuid PK, `name`, `description`, `score` text, `state` enum `state_enum` (`ACTIVE`|`INACTIVE`), `created_at`, `updated_at`. Ver `back.sql` (definición exacta por verificar).

### 2.2. `events`
| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | NO | PK |
| `title` | varchar(255) | NO | |
| `slug` | varchar(255) | NO | UNIQUE (`events_slug_key`) |
| `event_type` | varchar(20) | NO | CHECK: `MEETUP`, `CONFERENCE`, `HACKATHON`, `WORKSHOP` |
| `capacity` | int4 | NO | |
| `date_start` | timestamptz | NO | |
| `date_end` | timestamptz | SÍ | |
| `is_published` | bool | SÍ | default `false` |
| `description`, `image_url`, `banner_url`, `location_name`, `address_link`, `category` | text/varchar | SÍ | |
| `location_type` | varchar | SÍ | default `PHYSICAL`; CHECK `check_location_type`: `PHYSICAL`, `VIRTUAL`, `HYBRID` |
| `extra_info` | jsonb | SÍ | default `{}`; contiene `form_fields` (array de `{key,label,type,required,placeholder?,options?}`; type: `text`, `number`, `checkbox`, `select`) |
| `created_at`, `updated_at` | timestamptz | SÍ | |

Trigger `trg_prevent_event_delete`: no se puede borrar un evento con inscripciones (usar despublicar).

### 2.3. `ticket_types`
`id`, `event_id` (FK events, ON DELETE CASCADE), `name` varchar(100), `price` numeric(10,2) default 0, `ticket_capacity` int4 NULL, `payment_qr_url`, `description`, `image_url`, `created_at`, `updated_at`.
- CHECK `check_qr_for_paid_tickets`: price = 0 => `payment_qr_url` NULL; price > 0 => QR no nulo ni vacío.
- UNIQUE (`event_id`, `name`).

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
Trigger `trg_process_registration_coupon` (BEFORE INSERT en registrations): valida cupón/evento/usos y, si el rol no es ATTENDEE, fuerza `event_role` y `status = CONFIRMED`.

### 2.7. `event_staff_assignments`
`id`, `event_id` (FK events, CASCADE), `staff_email` varchar, `assigned_at` timestamptz default now(). UNIQUE (`event_id`, `staff_email`). No tiene `created_at`/`updated_at` (excepción a la regla general).

### 2.8. `registrations`
`id`, `event_id` (FK, CASCADE), `user_id` (FK users, SET NULL, nullable), `ticket_type_id` (FK ticket_types, ON DELETE RESTRICT), `event_role` varchar(20) default `ATTENDEE` (CHECK `ATTENDEE|SPEAKER|SPONSOR|STAFF`), `status` varchar(20) (CHECK `PENDING|CONFIRMED|CANCELLED`), `custom_responses` jsonb, `payment_proof_url` text, `coupon_id` uuid (FK event_coupons, SET NULL), `created_at`, `updated_at`. UNIQUE (`event_id`, `user_id`).
- `back.sql` declara default de `status` = `'REGISTERED'`, que viola el CHECK: **por verificar** el default real en remoto.

### 2.9. `session_registrations`
PK compuesta (`registration_id` FK registrations CASCADE, `session_id` FK sessions CASCADE), `registered_at`. Sin `id`/`updated_at`. Lectura pública (cupos del checkout).

### 2.10. `scan_logs`
`id`, `registration_id` (FK registrations, CASCADE), `scanned_by` (FK users, SET NULL), `scan_type` varchar(30), `scanned_at`, `created_at`, `updated_at`.
- Valores usados por el código del back-office: `checkin`, `refrigerio`, `session`, `session_entry:<id>`.
- `back.sql` define un CHECK con valores distintos (`CHECK_IN_DOOR`, `SNACK_DAY_1`, `LUNCH_DAY_2`, `SWAG_DELIVERY`, `SESSION_IN`): **por verificar** el CHECK vigente en remoto (probablemente cambiado fuera de migraciones).

### 2.11. `staff_whitelist`
`id`, `email` varchar(255) UNIQUE, `role` varchar(20) (CHECK `SUPERADMIN|STAFF`), `created_at`, `updated_at`. Fuente del rol del operador.

### 2.12. `users`
`id` (vínculo con auth.users), `email` UNIQUE, `first_name`, `last_name`, `avatar_url`, `phone`, `extra_info` jsonb, `is_staff` bool (**legacy**, ya no decide permisos), `created_at`, `updated_at`.

### 2.13. `inscripciones_sessions` (LEGACY)
`id`, `usuario_id`, `session_id` (FK sessions CASCADE), `inscrito_en`, `asistio`, `checked_in_at`. UNIQUE (`usuario_id`, `session_id`). Reemplazada por `session_registrations`; no usar en código nuevo.

### 2.14. Storage
- `event-assets`: público, límite 2 MB, MIME `image/jpeg|png|webp`. Lectura pública; insert/update/delete solo SUPERADMIN.
- `payment-proofs`: comprobantes de pago de asistentes (ruta `<event_id>/<user_id>/<timestamp>.<ext>`); políticas `payment_proofs_insert`/`payment_proofs_select` por bucket (`013`). Privacidad exacta **por verificar**.

### 2.15. Funciones
| Función | Descripción |
| --- | --- |
| `get_my_role()` | Rol (`SUPERADMIN`/`STAFF`) del usuario actual vía `staff_whitelist` + `auth.users` (SECURITY DEFINER). |
| `is_superadmin()` | `get_my_role() = 'SUPERADMIN'`. |
| `has_event_access(event_id)` | SUPERADMIN o email asignado en `event_staff_assignments`. |
| `validate_coupon(p_event_id, p_code)` | RPC SECURITY DEFINER; devuelve `id, role, max_uses, uses_left` del cupón (case-insensitive). Solo `authenticated`. |
| `get_coupon_uses(coupon_id)` | Conteo de usos del cupón. |
| `is_staff()` | Definida en `017`, usada por políticas no reescritas (p. ej. sponsors). Estado actual **por verificar**. |
| `update_updated_at_column()` | Trigger de `updated_at`. |

---

## 3. Flujo para Modificaciones de Base de Datos

1. **Definir la columna/tabla en este documento** antes de usarla en el código.
2. **Migración SQL** con `npm run db:new -- <nombre>` (crea `supabase/migrations/<timestamp>_<nombre>.sql`): PKs, FKs con `on delete` explícito, RLS habilitado. Probarla con `npm run db:reset` (local).
3. **Regenerar tipos** (`npx supabase gen types typescript --local`) y actualizar `src/app/core/supabase/supabase.client.ts` en este repo y en eventos-gdg-tarija.
4. Ajustar menú/rutas si cambia la navegación.
5. **PR a `dev`** desde una rama de trabajo (nunca a `main`; el workflow `DB CI` re-aplica todas las migraciones) → en el release `dev → main`, `db-deploy-prod` aplica en prod tras aprobación manual. Si la migración toca datos existentes, antes hacer el ensayo con backup. Nunca aplicar migraciones en prod a mano (SQL Editor, MCP o `db push` local). Ver `docs/entornos-supabase.md`.

Migraciones pendientes, NO aplicadas en prod:
- `20261024155150_close_coupon_read_leak.sql` (elimina `authenticated_read_event_coupons`). Aplicar solo después de desplegar el checkout público que usa `rpc validate_coupon`.
- `20261024032944_tracks_event_fk.sql` (FK `tracks.evento_id → events.id`). Prod no tiene tracks huérfanos (verificado 2026-10-24).

---

## 4. Seguridad (RLS) y Roles

El rol del operador viene de `get_my_role()` (tabla `staff_whitelist`). `AUTH_WHITELIST` (`auth-whitelist.ts`) e `is_staff()` como mecanismo del back-office ya no existen: el front llama a `AuthService.resolveRole()` y los guards solo son UX.

| Rol | Permisos |
| --- | --- |
| `SUPERADMIN` | Lee y escribe todo: events, ticket_types, tracks, sessions, event_coupons, event_staff_assignments, registrations (update), users, bucket `event-assets`. |
| `STAFF` | Solo lectura y check-in (insert/select en `scan_logs`) en eventos asignados (`has_event_access`); lee `users` de inscritos de esos eventos. No escribe eventos. |
| Asistente (authenticated) | Lee eventos publicados, crea sus registrations, lee sus propios `scan_logs`. |

Políticas relevantes: `public_read_published_events`, `staff_write_events` (solo superadmin), `staff_write_ticket_types`, `superadmin_write_tracks|sessions|event_coupons|assignments`, `select_own_or_staff_registrations`, `staff_select_scan_logs`/`staff_insert_scan_logs`, `staff_select_users_for_assigned_events`.

**Regla crítica**: para dar acceso a un operador, agregar su email a `staff_whitelist` (migración/SQL con rol `SUPERADMIN` o `STAFF`) y, si es STAFF, asignarlo al evento en `event_staff_assignments`. Sin fila en `staff_whitelist`, `get_my_role()` devuelve NULL y no podrá operar.

Fuga conocida: `authenticated_read_event_coupons` (SELECT con `USING (true)`) deja que cualquier autenticado liste todos los códigos de cupón hasta aplicar `20261023120000_close_coupon_read_leak.sql`.

Antes de tocar políticas, correr los advisors de seguridad de Supabase contra el proyecto real; no asumir por el código local.
