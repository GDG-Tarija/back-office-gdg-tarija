---
name: backoffice-features
description: Módulos administrativos, patrón CRUD, rutas, navegación y criterios funcionales del Back Office GDG Tarija.
---

# Features Del Back Office

Usar esta skill cuando la tarea implique crear o modificar módulos administrativos, CRUDs, rutas, navegación, tablas o entidades funcionales.

---

## Tipo De Aplicación

Este proyecto es un back-office para administración de datos de GDG Tarija. La experiencia principal son pantallas internas con tablas, filtros, formularios, acciones y reportes.

No asumir que es una landing pública ni una PWA de eventos. Si se necesita una vista pública, debe pedirse explícitamente.

---

## Módulos Existentes

```text
Inicio (/dashboard)      solo SUPERADMIN: atención de hoy, métricas, tendencia, flujo de caja
Eventos (/events)        listado, alta, gestión por pestañas, asistentes (+ credenciales)
Check-in (/checkin)      QR y búsqueda manual; STAFF entra directo aquí
Usuarios (/users)        solo SUPERADMIN: accesos al back-office, roles y eventos de cada STAFF
Actividad (/activity)    solo SUPERADMIN: quién hizo qué, con filtros por persona, evento, tipo y fechas
```

No existen módulos de Sponsors, Comunidades, Configuración ni Reportes: si se pide uno, tratarlo como feature nueva (`/create-crud`) y confirmar la entidad. Rutas en `app.routes.ts` (`homeGuard` oculta Inicio a STAFF y lo redirige a `/checkin`).

---

## Patrón CRUD

Un CRUD administrativo estándar debe incluir:

- Página contenedora ruteable.
- Tabla con paginación, ordenamiento y búsqueda.
- Acción primaria para crear.
- Acción de ver detalle.
- Acción de editar.
- Acción de eliminar con confirmación.
- Feedback de carga, éxito y error.
- Estado vacío.
- Tests para lógica propia de dominio/data cuando aplique.

Estructura recomendada:

```text
src/app/features/<entity>/
├── data/
│   ├── <entity>.api.ts
│   ├── <entity>.dto.ts
│   └── <entity>.mapper.ts
├── domain/
│   ├── <entity>.model.ts
│   └── <entity>.repository.ts
├── presentation/
│   ├── pages/
│   │   └── <entity>-page/
│   │       ├── <entity>-page.ts
│   │       ├── <entity>-page.html
│   │       └── <entity>-page.scss
│   └── components/
│       ├── <entity>-table/
│       ├── <entity>-form-dialog/
│       └── <entity>-detail-dialog/
└── <entity>.routes.ts
```

---

## Reglas De Entidades

- Modelos de dominio usan nombres claros y tipos estrictos.
- DTOs reflejan el contrato externo tal como llega.
- Mappers convierten fechas, enums, nullables y nombres cuando aplique.
- No usar una propiedad en UI si no está definida en el contrato/modelo revisado.
- Campos visibles en español; propiedades y código en inglés.

Ejemplo:

```ts
export interface Sponsor {
  id: string;
  name: string;
  description: string | null;
  status: SponsorStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type SponsorStatus = 'active' | 'inactive';
```

---

## Navegación

Cuando se agregue un feature administrativo:

- Registrar lazy route en `app.routes.ts` o en el layout correspondiente.
- Agregar entrada al menú solo si el módulo debe ser navegable.
- Usar labels en español.
- Mantener paths en inglés o kebab-case consistente: `/events`, `/users`, `/sponsors`.

---

## Filtros Y Búsqueda

Para el primer CRUD de una entidad:

- Búsqueda textual simple.
- Filtro por estado si la entidad tiene estado.
- No agregar filtros avanzados salvo requerimiento.
- Preparar el código para que filtros remotos/locales estén claros.

---

## Eliminación

Nunca eliminar sin confirmación visible.

La confirmación debe indicar la entidad afectada:

```text
¿Eliminar "DevFest Tarija"?
Esta acción no se puede deshacer.
```

Si el backend usa soft delete o estados, preferir desactivar/archivar cuando el dominio lo indique.

---

## Reportes

Para reportes:

- Priorizar filtros por rango de fechas y estado.
- Separar consulta/data de presentación.
- No mezclar cálculos agregados complejos en templates.
- Validar si la exportación CSV/PDF es requisito antes de implementarla.

---

## Checklist Para Nuevo CRUD

1. Revisar si la entidad ya existe.
2. Definir modelo de dominio.
3. Definir DTO y mapper si hay API externa.
4. Crear página ruteable lazy.
5. Crear tabla con búsqueda, paginación y acciones.
6. Crear diálogo de formulario.
7. Crear diálogo de detalle si aplica.
8. Agregar confirmación de eliminación.
9. Agregar tests para mapper/lógica.
10. Ejecutar lint/test/build relevante.

---

## Módulo De Gestión De Eventos (`src/app/features/events/`)

Estructura `data` / `domain` / `presentation`. Guía de usuario: `docs/gestion-de-eventos.md`.

### Rutas (`events.routes.ts`)

- `/events` listado (todos los roles; en móvil, tarjetas). Filtros arriba y fuera de la tabla; toda la fila abre el Resumen y el menú `⋮` lleva a Configuración (SUPERADMIN), Asistentes, Check-in y Credenciales.
- `/events/new` primer paso "Datos" (solo SUPERADMIN, `superadminGuard`, `unsavedChangesGuard`).
- `/events/:id/edit?tab=<pestaña>[&setup=1]` gestión por pestañas (solo SUPERADMIN, `runGuardsAndResolvers: 'always'`).
- `/events/:id/attendees` asistentes.
- `/events/:id` **Resumen** (`event-overview-page`, todos los roles): portada del evento con cifras (`buildEventOverview`), lo que requiere atención, últimas inscripciones, ocupación por paquete y detalles. Es el destino del listado y de las migas (`EventHeader.hubLink`). Va última en `events.routes.ts` para no tapar `new`, `:id/edit` ni `:id/attendees`.

### Alta y gestión (`event-wizard-page`, `event-manage-page`)

Al guardar "Datos" se crea el borrador (`is_published = false`) y la app pasa a `/events/:id/edit?tab=formulario&setup=1`: el paso vive en la URL, refrescar retoma y salir o cambiar de pestaña con cambios pregunta. `setup=1` muestra las pestañas como pasos con "Siguiente"; sin él es la gestión normal. Pestañas (`EVENT_TABS` en `domain/event-tabs.ts`): Datos, Formulario de registro, Paquetes, Tracks y sesiones, Cupones y staff, Publicación. Publicar/despublicar (despublicar muestra cuántas personas hay inscritas) y eliminar (solo sin inscritos; la BD lo refuerza con trigger). El estado compartido vive en `EventWorkspace` (`pages/event-workspace/`).

### Componentes (`presentation/components/`)

`event-header`, `event-section-nav`, `event-basics-form`, `form-fields-builder`, `ticket-types-editor`, `tracks-sessions-editor`, `coupons-editor`, `staff-assignment-editor`, `image-uploader`, `publish-checklist`, `credential-generator`, `payment-proof-dialog`.

### Dominio y validadores (`domain/`)

- `event-validators.ts`: `validateEvent`, `validateTicketType`, `validateTicketCapacities`, `validateTrack`, `validateSession`, `findSessionOverlaps`, `validateCoupon`, `validateStaffEmail`, `validateFormFields`, `validateImageFile`, `validatePublish`. Devuelven `{errors, warnings}`: los errores bloquean, los avisos no.
- Estados y roles: `registration-status.ts` (`REGISTRATION_STATUS_OPTIONS`: Confirmada / Pendiente de pago / Anulada) y `attendee-role.ts`; pluralización en `plural.ts`; pestañas en `event-tabs.ts`.
- Zona horaria fija America/La_Paz (UTC-4).
- Otros: `event-form`, `session-form`, `coupon-form`, `form-fields-builder.logic`, `ticket-phase-sync`, `attendee-search|export|payment`, `asset-path`, `asset-cleanup`, `domain-error`; y `data/postgres-error.mapper.ts` (`toUserMessage`) para traducir errores de Postgres.
- Repositorios (contratos) en `domain/*.repository.ts`, implementaciones `*.api.ts` en `data/` (Supabase).

### Asistentes (`attendees-page`)

Filtros por estado/rol/entrada/check-in/comprobante, tarjetas de estado, menú de estado por fila (SUPERADMIN), acción "Anular" con confirmación, `payment-proof-dialog` para revisar comprobantes (acciones a los otros dos estados para cualquier estado, con confirmación propia; emite `statusChange` y la página usa `changeFromProof` con `skipConfirmation`) y exportación CSV/Excel de lo filtrado. En móvil las filas son tarjetas.

### Check-in (`src/app/features/checkin/`)

`/checkin` con modos QR y Manual (y refrigerio/sesión). QR válido de inscripción Confirmada se registra al instante (verde a pantalla completa, vibración, "Deshacer"); Pendiente/Anulada/Ya registrado/otro evento piden atención con el motivo. Lógica pura en `domain/door-result.ts`, `event-preselection.ts` y `scan-history.ts`.

### Roles

- SUPERADMIN: crea, edita, publica y elimina; sube imágenes; cambia estados de inscripción; ve Inicio.
- STAFF: ve eventos asignados, asistentes y hace check-in; sin acceso a `/events/new`, `/events/:id/edit` ni Inicio.
- El rol sale de `AuthService.role()` (RPC `get_my_role`). La seguridad real es RLS.

### Usuarios (`src/app/features/users/`)

- `/users` (SUPERADMIN): lista de `staff_whitelist` vía RPC `list_backoffice_users` (nombre, último ingreso, quién dio el acceso, eventos asignados). Agregar (correo + rol), cambiar rol y quitar acceso pasan por RPCs (`add_backoffice_user`, `set_backoffice_user_role`, `remove_backoffice_user`); la base impide actuar sobre uno mismo y dejar el panel sin superadmin, y `domain/user-rules.ts` lo replica para avisar antes.
- En la UI el rol STAFF se llama **"Staff de check-in"**: no confundir con el rol de evento "Staff" que da un cupón (`registrations.event_role`), que no da acceso al panel.
- Eventos de un STAFF: diálogo `user-events-dialog` en Usuarios o `staff-assignment-editor` en la Configuración del evento, que solo ofrece personas con acceso STAFF (la FK a `staff_whitelist` lo exige).
- Todo cambio queda en `audit_log` (ver skill `database`).

### Actividad (`src/app/features/activity/`)

- RPC `list_audit_log` (solo SUPERADMIN) → `AuditRepository`. `domain/describe-audit.ts` convierte cada fila en una frase en español ("Confirmó el pago de Ana Paz", "Deshizo el check-in de…", "Dio acceso a … como Staff de check-in") y `changeLines` arma el antes → después.
- `audit-timeline` (reutilizable): pantalla `/activity` (filtros en la URL: `evento`, `persona`, `tipo`), "Historial" en el detalle de la inscripción (Asistentes), "Actividad reciente" en el Resumen del evento y "Ver actividad" en el menú `⋮` de Usuarios.
- El actor puede ser alguien del back-office, la propia persona desde la web ("Desde la web") o "Sistema" (consola/migración, "Fuera de la app"); lo importado al crear la auditoría lleva "Importado".

### Tests

Validadores, mappers y lógica de dominio tienen specs (`*.spec.ts`) junto al código; correr `npm test`.
