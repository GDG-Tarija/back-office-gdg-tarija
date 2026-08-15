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

## Módulos Esperados

Mapa inicial sugerido:

```text
Dashboard
├── Resumen general
├── Métricas rápidas
└── Actividad reciente

Administración
├── Usuarios
├── Eventos
├── Sponsors
├── Comunidades/Aliados
└── Configuración

Reportes
├── Eventos
├── Asistentes
└── Sponsors
```

Este mapa es una guía. Antes de crear un módulo, revisar si ya existe una convención o preguntar si la entidad no está clara.

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
