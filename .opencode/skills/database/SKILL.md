---
name: database-and-features
description: Esquema de entidades de base de datos (Postgres/Supabase) y estructura de rutas/menús del sistema.
---

# Entidades de Base de Datos y Módulos del Sistema (Features & DB Schema)

Este documento centraliza el diseño lógico de las entidades de la base de datos de Supabase y el mapa de navegación/rutas por módulos del sistema.

---

## 1. Rutas y Estructura de Módulos (Menu & Features)

La arquitectura de vistas y menús del sistema está distribuida en los siguientes módulos:

```
├── Dashboard/                          # Dashboard principal y widget cards
│
├── Admin/                              # Módulos de Administración
│   ├── Usuarios/                       # CRUD de usuarios y roles
│   ├── Eventos/                        # CRUD de eventos y lanzamientos
│   └── Sponsors/                       # CRUD de patrocinadores de la comunidad
│
├── Reportes/                           # Módulos de Reportes y Estadísticas
│   ├── Eventos/                        # Reporte de métricas de eventos
│   └── Usuarios/                       # Reporte de asistentes e inscripciones
```

---

## 2. Esquema de Entidades de Base de Datos

Todas las columnas de las tablas de Supabase se generan de forma tipada. No modificar la base de datos a mano; proponer primero una migración SQL en `supabase/migrations/` y actualizar este documento.

### 2.1. Brand (Marcas / Organizaciones asociadas)

**Tabla:** `brands`

| Columna       | Tipo          | Restricciones                    | Descripción                                  |
| ------------- | ------------- | -------------------------------- | -------------------------------------------- |
| `id`          | String (UUID) | PK, `default: gen_random_uuid()` | Identificador único de la marca.             |
| `name`        | String        | Nullable                         | Nombre comercial de la marca.                |
| `description` | String        | Nullable                         | Descripción corta de la marca.               |
| `score`       | String        | Nullable                         | Puntuación o valor de scoring de marca.      |
| `state`       | State (enum)  | `NOT NULL`, `default: ACTIVE`    | Estado del registro (`ACTIVE` / `INACTIVE`). |
| `created_at`  | TIMESTAMPTZ   | `default: NOW()`                 | Fecha y hora de creación automática.         |
| `updated_at`  | TIMESTAMPTZ   | `default: NOW()`                 | Fecha y hora de última modificación.         |

### 2.2. Events (Eventos de la Comunidad)

**Tabla:** `events`

| Columna         | Tipo                     | ¿Acepta Nulos? | Descripción                                                                          |
| --------------- | ------------------------ | -------------- | ------------------------------------------------------------------------------------ |
| `id`            | UUID                     | NO             | Identificador único del evento. PK.                                                  |
| `title`         | Character Varying        | NO             | Título descriptivo del evento.                                                       |
| `slug`          | Character Varying        | NO             | Slug único para URL pública (ej: `devfest-2026`).                                    |
| `event_type`    | Character Varying        | NO             | Tipo de evento (ej: `MEETUP`, `CONFERENCE`, `HACKATHON`, `WORKSHOP`).                |
| `capacity`      | Integer                  | NO             | Capacidad máxima de asistentes admitidos.                                            |
| `date_start`    | Timestamp with Time Zone | NO             | Fecha y hora de inicio del evento.                                                   |
| `date_end`      | Timestamp with Time Zone | SÍ             | Fecha y hora de finalización (opcional).                                             |
| `is_published`  | Boolean                  | SÍ             | Estado de publicación del evento en la landing pública.                              |
| `created_at`    | Timestamp with Time Zone | SÍ             | Fecha y hora de creación automática.                                                 |
| `updated_at`    | Timestamp with Time Zone | SÍ             | Fecha y hora de última actualización automática.                                     |
| `description`   | Text                     | SÍ             | Descripción extensa o contenido informativo del evento.                              |
| `image_url`     | Text                     | SÍ             | Enlace de la imagen promocional.                                                     |
| `logo_url`      | Text                     | SÍ             | Enlace del logo o insignia del evento.                                               |
| `banner_url`    | Text                     | SÍ             | Enlace del banner superior horizontal.                                               |
| `location_type` | Character Varying        | SÍ             | Modalidad (ej: `PHYSICAL`, `VIRTUAL`, `HYBRID`).                                     |
| `location_name` | Text                     | SÍ             | Nombre de la ubicación física o plataforma virtual (ej: `Edificio Postgrado UAJMS`). |
| `address_link`  | Text                     | SÍ             | Enlace interactivo de mapa (Google Maps) o aula virtual.                             |
| `category`      | Character Varying        | SÍ             | Eje temático o categoría tecnológica.                                                |
| `extra_info`    | JSONB                    | SÍ             | Metadata dinámica (contiene las preguntas personalizadas `form_fields`).             |

### 2.3. Registrations (Inscripciones a Eventos)

**Tabla:** `registrations`

| Columna             | Tipo                     | ¿Acepta Nulos? | Descripción                                                                 |
| ------------------- | ------------------------ | -------------- | --------------------------------------------------------------------------- |
| `id`                | UUID                     | NO             | Identificador único de la inscripción. PK.                                  |
| `event_id`          | UUID                     | NO             | Identificador del evento. FK a `events.id`.                                 |
| `user_id`           | UUID                     | SÍ             | Identificador del usuario asistente. FK a `users.id` (vincular en login).   |
| `ticket_type_id`    | UUID                     | NO             | Tipo de pase seleccionado. FK a `ticket_types.id`.                          |
| `event_role`        | Character Varying        | NO             | Rol en el evento (ej: `ATTENDEE`, `SPEAKER`, `ORGANIZER`, `VOLUNTEER`).     |
| `status`            | Character Varying        | NO             | Estado del registro (ej: `CONFIRMED`, `PENDING` para de pago, `CANCELLED`). |
| `created_at`        | Timestamp with Time Zone | SÍ             | Fecha y hora de la inscripción.                                             |
| `updated_at`        | Timestamp with Time Zone | SÍ             | Fecha y hora de última modificación.                                        |
| `custom_responses`  | JSONB                    | SÍ             | Respuestas dinámicas al formulario configurable del evento.                 |
| `payment_proof_url` | Text                     | SÍ             | Enlace o path al almacenamiento del comprobante de pago.                    |

### 2.4. Ticket Types (Tipos de Entradas / Pases)

**Tabla:** `ticket_types`

| Columna           | Tipo                     | ¿Acepta Nulos? | Descripción                                                       |
| ----------------- | ------------------------ | -------------- | ----------------------------------------------------------------- |
| `id`              | UUID                     | NO             | Identificador único del tipo de ticket. PK.                       |
| `event_id`        | UUID                     | NO             | Identificador del evento asociado. FK a `events.id`.              |
| `name`            | Character Varying        | NO             | Nombre del tipo de pase (ej: `Entrada General`, `Pase VIP`).      |
| `price`           | Numeric                  | NO             | Precio en moneda local (0 si es gratis).                          |
| `ticket_capacity` | Integer                  | SÍ             | Capacidad de tickets disponibles para esta categoría.             |
| `created_at`      | Timestamp with Time Zone | SÍ             | Fecha y hora de creación.                                         |
| `updated_at`      | Timestamp with Time Zone | SÍ             | Fecha y hora de última actualización.                             |
| `payment_qr_url`  | Text                     | SÍ             | Enlace al QR de pago bancario/transferencia (solo si es de pago). |

### 2.5. Users (Perfiles y Cuentas de Usuarios)

**Tabla:** `users`

| Columna      | Tipo                     | ¿Acepta Nulos? | Descripción                                                         |
| ------------ | ------------------------ | -------------- | ------------------------------------------------------------------- |
| `id`         | UUID                     | NO             | Identificador único del usuario. PK (vínculo con Supabase Auth).    |
| `email`      | Character Varying        | NO             | Correo electrónico de la cuenta de usuario.                         |
| `first_name` | Character Varying        | NO             | Nombre de pila.                                                     |
| `last_name`  | Character Varying        | NO             | Apellidos.                                                          |
| `avatar_url` | Text                     | SÍ             | Enlace de la foto de perfil (proveído por Google OAuth).            |
| `phone`      | Character Varying        | SÍ             | Número celular de contacto.                                         |
| `extra_info` | JSONB                    | SÍ             | Campos extras dinámicos del perfil.                                 |
| `is_staff`   | Boolean                  | SÍ             | Permiso especial de personal organizador (vista de administración). |
| `created_at` | Timestamp with Time Zone | SÍ             | Fecha y hora del primer registro de la cuenta.                      |
| `updated_at` | Timestamp with Time Zone | SÍ             | Fecha y hora de última modificación del perfil.                     |

---

## 3. Flujo para Modificaciones de Base de Datos y Rutas

1. **Definir la columna/tabla en este documento**: Antes de usar una columna en frontend o backend, debe estar listada aquí.
2. **Crear migración SQL**: Escribir la migración en `supabase/migrations/` definiendo PKs, FKs con `on delete` explícito y habilitando RLS.
3. **Generar tipos**: Correr `supabase gen types typescript --local > src/app/core/models/database.types.ts` para sincronizar tipos con TypeScript.
4. **Actualizar el componente de navegación**: Ajustar el menú de navegación correspondiente en `src/app/` para que coincida con la ruta y los módulos definidos en este skill.
