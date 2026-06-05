---
name: project-architecture
description: Angular 21, clean architecture, standalone components, signals, PrimeNG y patrones técnicos del Back Office GDG Tarija.
---

# Arquitectura Del Proyecto

Usar esta skill cuando la tarea toque estructura de carpetas, rutas, servicios, datos, dominio, componentes Angular o decisiones técnicas transversales.

Ver también: [`AGENTS.md`](../../../AGENTS.md) y [backoffice-features](../backoffice-features/SKILL.md).

---

## Stack

| Capa             | Tecnología            |
| ---------------- | --------------------- |
| Framework        | Angular 21            |
| Componentes      | Standalone components |
| Estado UI        | Signals               |
| Change detection | Zoneless              |
| UI               | PrimeNG 21 Aura       |
| Layout/utilities | Tailwind CSS v4       |
| Test             | Vitest                |
| Lint/formato     | ESLint + Prettier     |

Restricciones:

- No crear `NgModule`.
- No introducir Angular Material, Bootstrap u otra librería UI.
- No usar `any` salvo justificación breve.
- No poner lógica de negocio en templates.
- No crear arquitectura global innecesaria antes de tener una feature real.

---

## Estructura Por Feature

Cada feature nueva debe seguir esta forma:

```text
src/app/features/<feature>/
├── data/
│   ├── <feature>.api.ts          # integración HTTP o cliente externo
│   ├── <feature>.dto.ts          # contratos externos
│   └── <feature>.mapper.ts       # DTO <-> dominio
├── domain/
│   ├── <feature>.model.ts        # modelos de dominio
│   ├── <feature>.repository.ts   # contrato abstracto/interfaz
│   └── <use-case>.ts             # lógica pura si aplica
├── presentation/
│   ├── pages/
│   │   └── <feature>-page/
│   └── components/
│       ├── <feature>-table/
│       ├── <feature>-form-dialog/
│       └── <feature>-detail-dialog/
└── <feature>.routes.ts
```

Regla de dependencias:

- `domain` no importa Angular.
- `data` puede importar Angular para `HttpClient`, providers o DI.
- `presentation` importa Angular, PrimeNG, shared y domain.
- `presentation` no debe conocer DTOs externos si existe mapper.

---

## Rutas

Registrar features mediante `loadChildren`:

```ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'events',
    loadChildren: () => import('./features/events/events.routes').then((m) => m.EVENTS_ROUTES),
  },
];
```

Archivo de rutas de feature:

```ts
import { Routes } from '@angular/router';

export const EVENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./presentation/pages/events-page/events-page').then((m) => m.EventsPage),
  },
];
```

Usar nombres exportados en mayúsculas para constantes de rutas: `EVENTS_ROUTES`, `USERS_ROUTES`.

---

## Estado En Componentes

Preferir signals para estado local:

```ts
import { Component, computed, inject, signal } from '@angular/core';

@Component({
  selector: 'app-events-page',
  standalone: true,
  templateUrl: './events-page.html',
})
export class EventsPage {
  private readonly eventsApi = inject(EventsApi);

  readonly events = signal<Event[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasEvents = computed(() => this.events().length > 0);

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.events.set(await this.eventsApi.list());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los datos');
    } finally {
      this.loading.set(false);
    }
  }
}
```

---

## Data Layer

Cuando exista API HTTP, aislar contratos externos:

```ts
// data/event.dto.ts
export interface EventDto {
  id: string;
  title: string;
  status: string;
  startsAt: string;
}

// domain/event.model.ts
export interface Event {
  id: string;
  title: string;
  status: EventStatus;
  startsAt: Date;
}

export type EventStatus = 'draft' | 'published' | 'archived';

// data/event.mapper.ts
export function mapEventDto(dto: EventDto): Event {
  return {
    id: dto.id,
    title: dto.title,
    status: dto.status as EventStatus,
    startsAt: new Date(dto.startsAt),
  };
}
```

Servicios concretos deben devolver dominio, no DTOs, si ya hay mapper.

---

## PrimeNG Imports

Los componentes standalone importan solo módulos PrimeNG necesarios:

```ts
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
```

No crear un módulo compartido global de PrimeNG. Mantener imports explícitos por componente.

---

## Tests

Prioridad de tests:

1. Mappers DTO/domain.
2. Use cases de dominio.
3. Servicios con dependencias mockeadas.
4. Componentes con lógica condicional relevante.

Evitar tests frágiles de markup PrimeNG salvo que validen comportamiento propio.

---

## Anti-Patrones

- Crear `shared` genérico antes de tener dos usos reales.
- Pasar DTOs externos hasta el template.
- Duplicar interfaces entre data/domain sin mapper claro.
- Agregar servicios globales para lógica específica de una feature.
- Mezclar lógica de permisos, transformación de datos y UI en un componente.
- Importar librerías UI no aprobadas.
