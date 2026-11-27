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
| `/events/:id`           | autenticado                    | Resumen del evento (portada).                        |
| `/checkin`              | autenticado                    | Check-in (STAFF solo en eventos asignados, por RLS). |
| `/users`                | SUPERADMIN (`superadminGuard`) | Usuarios del back-office (accesos y roles).          |
| `/activity`             | SUPERADMIN (`superadminGuard`) | Actividad: quién hizo qué (lee `audit_log`).         |

Los guards son solo UX; la seguridad real son las políticas RLS.

---

## 2. Esquema de Base de Datos

**Dueño del esquema: este repo (`supabase/migrations/`)**; eventos-gdg-tarija ya no guarda copia. Fuente de verdad: `supabase/migrations/20261024032707_baseline.sql` (`supabase db pull` de producción, 2026-10-24) + migraciones posteriores. Las migraciones anteriores se eliminaron (siguen en el historial de git de eventos-gdg-tarija (antes del 2026-10-24)). Lo que no se puede confirmar sin la BD remota se marca **por verificar**. No modificar la BD a mano: migración primero, luego actualizar este documento.

Convención: `updated_at` se mantiene con trigger `update_updated_at_column()` (events, staff_whitelist, users, sessions, ticket_types, ticket_phases, registrations, scan_logs, tracks).

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
- Trigger `trg_session_datetime_conflict` (BEFORE INSERT en `session_registrations`, función `check_session_datetime_conflict`): rechaza inscribirse a dos sesiones del mismo día que empiezan a la vez o cuyos rangos `[start_time, end_time)` se cruzan; sin `end_time` la sesión cuenta como un instante. Definición vigente en `20261121160500_session_conflict_overlap.sql`. El sitio de registro aplica el mismo criterio (`session-schedule.ts` en eventos).
- Trigger `trg_prevent_session_delete`: no se borra una sesión con inscritos.

### 2.6. `event_coupons`

`id`, `event_id` (FK events, CASCADE), `code` varchar(50), `role` varchar(20) default `ATTENDEE` (CHECK: `ATTENDEE`, `SPEAKER`, `SPONSOR`, `STAFF`), `max_uses` int default 1, `created_at`, `updated_at`. UNIQUE (`event_id`, `code`).
Trigger `trg_process_registration_coupon` (BEFORE INSERT en registrations; único trigger de inserción, hace todo en orden): (1) valida cupón/evento/usos (P0002/P0003) y, si el rol no es ATTENDEE, fuerza `event_role` y `status = CONFIRMED`; (2) para usuarios no SUPERADMIN fuerza rol ATTENDEE; (3) asigna `ticket_phase_id` (ignora lo enviado; bloquea el paquete con `FOR NO KEY UPDATE` para serializar registros concurrentes), respeta `ticket_types.ticket_capacity` y el cupo de cada fase, y lanza **P0010** si todo está lleno (los roles especiales no consumen cupo ni fallan); SUPERADMIN/sin JWT puede enviar su fase (debe ser del paquete, si no **P0011**); (4) para no SUPERADMIN fija `status` = CONFIRMED si el precio de la fase asignada (o del paquete si no hay fases) es 0, si no PENDING. No usar `P0004` (es `assert_failure` y PL/pgSQL no lo atrapa con `WHEN OTHERS`).

### 2.7. `event_staff_assignments`

`id`, `event_id` (FK events, CASCADE), `staff_email` varchar (FK `staff_whitelist.email`, ON UPDATE/DELETE CASCADE desde `20261115235749`), `assigned_at` timestamptz default now(). UNIQUE (`event_id`, `staff_email`). No tiene `created_at`/`updated_at` (excepción a la regla general). Solo se puede asignar un correo con acceso al back-office; quitarle el acceso borra sus asignaciones. El correo se guarda en minúsculas (trigger `normalize_staff_email`).

- Policy `staff_read_own_assignments` (SELECT, corregida en `20261114171703`): `is_superadmin()` o `lower(staff_email) = lower(auth.jwt() ->> 'email')`. La versión original leía `auth.users` como `authenticated` (sin permiso) y fallaba con 42501 para todo STAFF; ahora cada STAFF lee solo sus asignaciones sin tocar `auth.users`. Escritura: solo SUPERADMIN.

### 2.7.1. `event_whatsapp_groups`

`id`, `event_id` (FK events, CASCADE, UNIQUE: un link por evento), `url` text NOT NULL (CHECK: link de invitación `https://chat.whatsapp.com/<código>`), `created_at`, `updated_at` (trigger `update_updated_at_column`). Desde `20261121170000`.

- Va aparte de `events` porque `events` es de lectura pública: ahí el link quedaría expuesto vía API.
- Policy `registered_read_event_whatsapp_groups` (SELECT): `is_superadmin()`, `has_event_access(event_id)` o una inscripción propia del evento con `status <> 'CANCELLED'` (pendientes incluidas). Escritura: solo SUPERADMIN (`superadmin_write_event_whatsapp_groups`).
- Se edita en "Datos" del evento (campo "Grupo de WhatsApp"); el sitio de registro lo muestra a inscritos no anulados.
- Sin trigger de auditoría.

### 2.8. `registrations`

`id`, `event_id` (FK, CASCADE), `user_id` (FK users, ON DELETE SET NULL, ON UPDATE CASCADE desde `20261127013739`, nullable), `ticket_type_id` (FK ticket_types, ON DELETE RESTRICT), `event_role` varchar(20) default `ATTENDEE` (CHECK `ATTENDEE|SPEAKER|SPONSOR|STAFF`), `status` varchar(20) (CHECK `PENDING|CONFIRMED|CANCELLED`), `custom_responses` jsonb, `payment_proof_url` text, `coupon_id` uuid (FK event_coupons, SET NULL), `ticket_phase_id` uuid NULL (FK ticket_phases, ON DELETE RESTRICT, indexada; la asigna el trigger, el cliente no la elige), `created_at`, `updated_at`. UNIQUE (`event_id`, `user_id`).

- `back.sql` declara default de `status` = `'REGISTERED'`, que viola el CHECK: **por verificar** el default real en remoto.
- Estados en el back-office (issue #7): `CONFIRMED` = pagada/confirmada, `PENDING` = pendiente de pago, `CANCELLED` = anulada. Solo SUPERADMIN los cambia (policy `staff_update_registrations`); el front envía solo `{ status }` (`RegistrationsApi`). Cualquier transición es válida, incluida restaurar una anulada. Dominio en `features/events/domain/registration-status.ts`.
- Una inscripción `CANCELLED` no registra asistencia: lo impide el trigger `trg_prevent_attendance_for_cancelled_registration` en `scan_logs` (ver 2.10). `PENDING` no lo bloquea la base; el check-in por QR exige `CONFIRMED` en la app.

### 2.9. `session_registrations`

PK compuesta (`registration_id` FK registrations CASCADE, `session_id` FK sessions CASCADE), `registered_at`. Sin `id`/`updated_at`. Lectura pública (cupos del checkout).

### 2.10. `scan_logs`

`id`, `registration_id` (FK registrations, CASCADE), `scanned_by` (FK users, SET NULL), `scan_type` varchar(50), `scanned_at`, `created_at`, `updated_at`.

- Valores usados por el código del back-office: `checkin`, `refrigerio`, `session`, `session_entry:<id>`.
- Tickets del sorteo (migración `20261122092228`, los escribe solo la RPC `scan_ticket`): `pts:<point_activities.id>` (1 por actividad y persona) y `net:<registrations.id de la otra persona>` (networking, una fila a cada lado, tope `networking_ticket_cap()` = 5 por persona). La policy `staff_insert_scan_logs` rechaza `pts:%`/`net:%` (nadie los inserta a mano por la API). Ambos exigen check-in previo, así que contar cualquier fila de `scan_logs` como asistencia sigue siendo correcto. El trigger `trg_drop_tickets_without_checkin` (AFTER DELETE de un `checkin`, p. ej. el Deshacer de la puerta o al borrar la inscripción) borra los `pts:`/`net:` de esa persona y los `net:` que otros sumaron con ella.
- `back.sql` define un CHECK con valores distintos (`CHECK_IN_DOOR`, `SNACK_DAY_1`, `LUNCH_DAY_2`, `SWAG_DELIVERY`, `SESSION_IN`): **por verificar** el CHECK vigente en remoto (probablemente cambiado fuera de migraciones).
- UNIQUE (`registration_id`, `scan_type`): un mismo tipo de escaneo no se registra dos veces.
- Trigger `trg_prevent_attendance_for_cancelled_registration` (BEFORE INSERT o UPDATE de `registration_id`, migración `20261109031500`): rechaza (`P0001`) registrar asistencia de una inscripción `CANCELLED`, por cualquier camino (QR, manual, refrigerio, sesiones). Anular no borra los `scan_logs` previos.
- Policy `staff_delete_recent_own_scan_logs` (DELETE, migración `20261114171703`): solo para `get_my_role()` SUPERADMIN/STAFF con `has_event_access` sobre el evento de la inscripción, filas con `scanned_by = auth.uid()` y `scanned_at` de los últimos 60 s. Es el "Deshacer" del check-in móvil; no hay UPDATE.

### 2.10.1. `point_activities` y `raffle_winners` (sorteo por tickets)

- `point_activities`: `id`, `event_id` (FK events, CASCADE), `name`, `created_at`, `updated_at`, UNIQUE (`event_id`, `name`). Actividades que dan 1 ticket (stand, pregunta en una sesión, Zona Zen…). SELECT para `authenticated`; sin policies de escritura (se cargan por SQL).
- `raffle_winners`: `id`, `event_id` (FK events, CASCADE), `registration_id` (FK registrations, CASCADE), `prize`, `tickets`, `voided_at` (NULL = vigente; con fecha = tachado: sigue en la lista y no vuelve a participar), `created_at`, `updated_at`, UNIQUE (`event_id`, `registration_id`). SELECT solo SUPERADMIN; la crea solo `draw_raffle`. Un SUPERADMIN puede tachar (UPDATE solo de `voided_at`, por permiso de columna) o eliminar (DELETE: vuelve a participar).
- Tickets de una persona = filas `checkin` + `pts:%` + `net:%` de su inscripción. Entra al sorteo con `status = 'CONFIRMED'`, `event_role = 'ATTENDEE'` y check-in.

### 2.11. `staff_whitelist`

`id`, `email` varchar(255) UNIQUE (en minúsculas, trigger `normalize_staff_email`), `role` varchar(20) (CHECK `SUPERADMIN|STAFF`), `created_at`, `updated_at`. Fuente del rol del operador. Sin policies de escritura: se gestiona desde `/users` con las RPCs `add_backoffice_user`, `set_backoffice_user_role` y `remove_backoffice_user` (solo SUPERADMIN). Es el rol **del back-office**; no tiene relación con `registrations.event_role` (el "Staff" que da un cupón no entra al panel).

### 2.11.1. `audit_log` (auditoría)

`id` bigint identity, `occurred_at`, `actor_id` (`auth.uid()`; NULL = Sistema: consola, migración o service role), `actor_email` (claim del JWT), `actor_role` (rol del back-office en ese momento; NULL = persona sin acceso, p. ej. inscripción desde la web), `action` (`INSERT|UPDATE|DELETE`), `table_name`, `record_id` (id de la fila; en `session_registrations`, la inscripción), `event_id` (resuelto por tabla), `changes` jsonb (INSERT/DELETE: la fila sin `created_at`/`updated_at`; UPDATE: solo lo que cambió, `{campo: [antes, después]}`), `source` (`app|backfill`).

- Lo escribe `audit_row_change()` (AFTER INSERT/UPDATE/DELETE, SECURITY DEFINER) en: `staff_whitelist`, `event_staff_assignments`, `events`, `ticket_types`, `ticket_phases`, `event_coupons`, `tracks`, `sessions`, `registrations`, `scan_logs`, `session_registrations`. Un UPDATE que solo toca `updated_at` no se registra. No se auditan `users` (sincroniza el perfil en cada login), `sponsors` ni `inscripciones_sessions`.
- Solo agregar: SELECT solo `is_superadmin()`; INSERT/UPDATE/DELETE/TRUNCATE revocados a `anon` y `authenticated`.
- Backfill (`source = 'backfill'`): altas de las inscripciones y escaneos que existían al desplegar `20261115235749`. Los cambios de estado anteriores no existen. El seed hace lo mismo con sus datos.

### 2.12. `users`

`id` (vínculo con auth.users), `email` UNIQUE, `first_name`, `last_name`, `avatar_url`, `phone`, `extra_info` jsonb, `is_staff` bool (**legacy**, ya no decide permisos), `created_at`, `updated_at`.

### 2.13. `inscripciones_sessions` (LEGACY)

`id`, `usuario_id`, `session_id` (FK sessions CASCADE), `inscrito_en`, `asistio`, `checked_in_at`. UNIQUE (`usuario_id`, `session_id`). Reemplazada por `session_registrations`; no usar en código nuevo.

### 2.14. Storage

- `event-assets`: público, límite 2 MB, MIME `image/jpeg|png|webp`. Lectura pública; insert/update/delete solo SUPERADMIN.
- `payment-proofs`: comprobantes de pago de asistentes (ruta `<event_id>/<user_id>/<timestamp>.<ext>`); políticas `payment_proofs_insert`/`payment_proofs_select` por bucket (`013`). Privacidad exacta **por verificar**.

### 2.15. Funciones

| Función                                                                                                  | Descripción                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_my_role()`                                                                                          | Rol (`SUPERADMIN`/`STAFF`) del usuario actual vía `staff_whitelist` + `auth.users`, sin distinguir mayúsculas (SECURITY DEFINER).                                                                                                                                                                                                                                                                                        |
| `is_superadmin()`                                                                                        | `get_my_role() = 'SUPERADMIN'`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `has_event_access(event_id)`                                                                             | SUPERADMIN o email asignado en `event_staff_assignments` **y** presente en `staff_whitelist` (desde `20261115235749`).                                                                                                                                                                                                                                                                                                   |
| `list_backoffice_users()`                                                                                | RPC SECURITY DEFINER, solo SUPERADMIN (`require_superadmin()`, si no 42501). Correo, rol, `user_id`, nombre/avatar, último ingreso (`auth.users`), alta y quién la dio, última actividad (`audit_log`) y eventos asignados (`assignment_id, event_id, title, date_start`).                                                                                                                                               |
| `add_backoffice_user(p_email, p_role)`                                                                   | Solo SUPERADMIN. Normaliza el correo. Errores: P0020 dato no válido, P0021 ya tiene acceso.                                                                                                                                                                                                                                                                                                                              |
| `set_backoffice_user_role(p_email, p_role)`                                                              | Solo SUPERADMIN. P0022 sobre uno mismo, P0023 dejaría el panel sin superadmin (filas bloqueadas FOR UPDATE), P0024 sin acceso.                                                                                                                                                                                                                                                                                           |
| `remove_backoffice_user(p_email)`                                                                        | Solo SUPERADMIN. Mismas reglas; borra sus asignaciones por la FK en cascada.                                                                                                                                                                                                                                                                                                                                             |
| `list_audit_log(p_event_id, p_actor_id, p_category, p_registration_id, p_from, p_to, p_limit, p_offset)` | RPC SECURITY DEFINER, solo SUPERADMIN. Filtra la auditoría (categorías `ACCESS`, `CONFIG`, `REGISTRATIONS`, `CHECKIN`; P0020 si no existe), pagina (máx. 200) y devuelve nombres legibles: `actor_name`, `event_title`, `subject_name` (persona inscrita, paquete, cupón, correo...) y `total_count`. Por inscripción incluye sus escaneos y sesiones elegidas.                                                          |
| `audit_row_change()`                                                                                     | Trigger de auditoría (SECURITY DEFINER); ver 2.11.1.                                                                                                                                                                                                                                                                                                                                                                     |
| `normalize_staff_email()`                                                                                | Trigger: correos de `staff_whitelist` / `event_staff_assignments` en minúsculas.                                                                                                                                                                                                                                                                                                                                         |
| `validate_coupon(p_event_id, p_code)`                                                                    | RPC SECURITY DEFINER; devuelve `id, role, max_uses, uses_left` del cupón (case-insensitive). Solo `authenticated`.                                                                                                                                                                                                                                                                                                       |
| `get_coupon_uses(coupon_id)`                                                                             | Conteo de usos del cupón.                                                                                                                                                                                                                                                                                                                                                                                                |
| `is_staff()`                                                                                             | Definida en `017`, usada por políticas no reescritas (p. ej. sponsors). Estado actual **por verificar**.                                                                                                                                                                                                                                                                                                                 |
| `get_ticket_availability(p_event_id)`                                                                    | RPC STABLE SECURITY DEFINER, `anon`+`authenticated`. Una fila por fase (`ticket_type_id, ticket_phase_id, name, position, price, payment_qr_url, capacity, sold, remaining, is_active, package_capacity, package_sold`); paquetes sin fases devuelven una fila con `ticket_phase_id` NULL. No expone inscripciones individuales.                                                                                         |
| `update_updated_at_column()`                                                                             | Trigger de `updated_at`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scan_ticket(p_event_id, p_registration_id, p_activity_id)`                                              | RPC SECURITY DEFINER, `authenticated`. La inscripción debe ser de `p_event_id` (si no, `invalid`). Con actividad: 1 ticket a la persona escaneada si hizo check-in (solo `can_award_tickets`, nunca a uno mismo). Sin actividad: networking, 1 ticket a cada lado si ambos hicieron check-in. Devuelve jsonb `{status, name, mine_added, theirs_added, my_net, net_cap}`; `name` solo a quien tiene permiso de escanear. |
| `my_tickets(p_event_id)`                                                                                 | RPC STABLE SECURITY DEFINER, `authenticated`. Tickets propios con su motivo (`kind`, `label`, `at`, `by_me`), `checked_in`, `can_award`, `net_count`.                                                                                                                                                                                                                                                                    |
| `draw_raffle(p_event_id, p_prize)`                                                                       | RPC SECURITY DEFINER, solo SUPERADMIN (42501). Sorteo ponderado por tickets (`-ln(1 - random()) / tickets`), un sorteo a la vez por evento (advisory lock), excluye ganadores previos e inscripciones sin cuenta, normaliza el premio (espacios e invisibles; exige una letra o número, máx. 200), inserta en `raffle_winners`. `{status: empty}` si no queda nadie.                                                     |
| `raffle_tickets(p_event_id, p_registration_id)`                                                          | Interna (sin EXECUTE para clientes). Única definición de "tickets válidos" (check-in + actividades existentes + networking con inscripciones del mismo evento); la usan `my_tickets` y `draw_raffle`.                                                                                                                                                                                                                    |
| `can_award_tickets(p_event_id)`                                                                          | Interna (sin EXECUTE para clientes): `has_event_access` o inscripción CONFIRMED con `event_role` SPEAKER/SPONSOR/STAFF.                                                                                                                                                                                                                                                                                                  |
| `networking_ticket_cap()`                                                                                | Tope de tickets de networking por persona (5).                                                                                                                                                                                                                                                                                                                                                                           |
| `prevent_attendance_for_cancelled_registration()`                                                        | Trigger de `scan_logs` (SECURITY INVOKER): bloquea asistencia de inscripciones `CANCELLED`.                                                                                                                                                                                                                                                                                                                              |

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
- `20261122092228_sorteo_tickets.sql` (sorteo por tickets: `scan_type` a varchar(50) y CHECK con `pts:%`/`net:%`, `staff_insert_scan_logs` rechaza `pts:%`/`net:%`, tablas `point_activities` y `raffle_winners`, RPCs `scan_ticket`, `my_tickets`, `draw_raffle`; `get_public_certificate` devuelve `user_email` en null). No cambia datos. Después del release, cargar las actividades del evento por SQL (`on conflict (event_id, name) do nothing`).
- `20261123014753_sorteo_ganadores_tachar.sql` (`raffle_winners.voided_at`, UPDATE limitado a esa columna y políticas de UPDATE/DELETE para SUPERADMIN: tachar o eliminar ganadores desde la pantalla del sorteo). No cambia datos.

---

## 4. Seguridad (RLS) y Roles

El rol del operador viene de `get_my_role()` (tabla `staff_whitelist`). `AUTH_WHITELIST` (`auth-whitelist.ts`) e `is_staff()` como mecanismo del back-office ya no existen: el front llama a `AuthService.resolveRole()` y los guards solo son UX.

| Rol                       | Permisos                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPERADMIN`              | Lee y escribe todo: events, ticket_types, tracks, sessions, event_coupons, event_staff_assignments, registrations (update), users, bucket `event-assets`.                                                          |
| `STAFF`                   | Solo lectura y check-in (insert/select en `scan_logs`, y delete de su propio escaneo de los últimos 60 s) en eventos asignados (`has_event_access`); lee `users` de inscritos de esos eventos. No escribe eventos. |
| Asistente (authenticated) | Lee eventos publicados, crea sus registrations, lee sus propios `scan_logs`.                                                                                                                                       |

Políticas relevantes: `public_read_published_events`, `staff_write_events` (solo superadmin), `staff_write_ticket_types`, `staff_write_ticket_phases`, `superadmin_write_tracks|sessions|event_coupons|assignments`, `select_own_or_staff_registrations`, `staff_select_scan_logs`/`staff_insert_scan_logs`/`staff_delete_recent_own_scan_logs`, `staff_select_users_for_assigned_events`.

**Regla crítica**: los accesos se dan en `/users` (SUPERADMIN): correo + rol `SUPERADMIN` o `STAFF`, y al STAFF se le asignan eventos desde Usuarios o desde la Configuración del evento. Sin fila en `staff_whitelist`, `get_my_role()` devuelve NULL y no podrá operar. Toda escritura en las tablas auditadas queda en `audit_log` con su actor.

Fuga conocida: `authenticated_read_event_coupons` (SELECT con `USING (true)`) deja que cualquier autenticado liste todos los códigos de cupón hasta aplicar `20261023120000_close_coupon_read_leak.sql`.

Antes de tocar políticas, correr los advisors de seguridad de Supabase contra el proyecto real; no asumir por el código local.
