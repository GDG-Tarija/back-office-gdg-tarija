---
name: design-system
description: Sistema visual del Back Office GDG Tarija con PrimeNG Aura, Tailwind CSS v4, tablas CRUD, formularios y accesibilidad.
---

# Sistema De Diseño

Usar esta skill cuando la tarea toque UI, layout, PrimeNG, Tailwind, tablas, formularios, diálogos, navegación o experiencia administrativa.

---

## Principios

- Back-office administrativo, denso y claro.
- Priorizar lectura de datos, acciones rápidas y feedback explícito.
- PrimeNG para componentes ricos; Tailwind para composición visual.
- Evitar UI genérica de landing pública salvo que se pida explícitamente.
- Mantener consistencia antes que introducir nuevos patrones visuales.

---

## Stack UI

- **PrimeNG 21** con preset Aura.
- **PrimeIcons** para iconografía.
- **Tailwind CSS v4** para spacing, flex/grid, responsive y ajustes.
- **tailwindcss-primeui** para tokens integrados.
- CSS layers configuradas como `tailwind, primeng`.

Archivo global actual:

```scss
@use 'tailwindcss';
@use 'primeicons/primeicons.css';
@plugin "tailwindcss-primeui";

@layer tailwind, primeng;
```

---

## Uso De PrimeNG

Usar PrimeNG para:

- `p-table` en listados CRUD.
- `p-dialog` para crear/editar/ver detalles.
- `p-confirmdialog` o `ConfirmationService` para eliminaciones.
- `p-toast` o `MessageService` para feedback.
- `p-button`, `p-inputtext`, `p-select`, `p-datepicker`, `p-tag`, `p-menu` según necesidad.
- `p-toolbar` o layout propio con Tailwind para encabezados de página.

No usar Angular Material ni Bootstrap.

---

## Layout Administrativo

Estructura típica de página:

```html
<section class="flex flex-col gap-4">
  <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900">Eventos</h1>
      <p class="text-sm text-surface-600">Gestiona los eventos de la comunidad.</p>
    </div>

    <p-button label="Nuevo evento" icon="pi pi-plus" />
  </header>

  <div class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm">
    <!-- filtros + tabla -->
  </div>
</section>
```

Preferir:

- Encabezado claro con título, descripción y acción primaria.
- Contenedor de tabla con borde suave y `shadow-sm`.
- Acciones destructivas visualmente diferenciadas.
- Estados `loading`, `empty`, `error` explícitos.

---

## Tablas CRUD

Patrón base:

- Filtro de búsqueda arriba.
- Paginación habilitada.
- Ordenamiento en columnas importantes.
- Columna final de acciones.
- Estado vacío cuando no hay resultados.
- Skeleton/loading cuando la carga no es inmediata.

Ejemplo:

```html
<p-table
  [value]="items()"
  [loading]="loading()"
  [paginator]="true"
  [rows]="10"
  [rowsPerPageOptions]="[10, 25, 50]"
  dataKey="id"
  responsiveLayout="scroll"
>
  <ng-template pTemplate="header">
    <tr>
      <th pSortableColumn="name">Nombre <p-sortIcon field="name" /></th>
      <th>Estado</th>
      <th class="w-40 text-right">Acciones</th>
    </tr>
  </ng-template>

  <ng-template pTemplate="body" let-item>
    <tr>
      <td>{{ item.name }}</td>
      <td><p-tag [value]="item.status" /></td>
      <td class="text-right">
        <p-button icon="pi pi-eye" text rounded ariaLabel="Ver detalle" />
        <p-button icon="pi pi-pencil" text rounded ariaLabel="Editar" />
        <p-button icon="pi pi-trash" text rounded severity="danger" ariaLabel="Eliminar" />
      </td>
    </tr>
  </ng-template>

  <ng-template pTemplate="emptymessage">
    <tr>
      <td colspan="3" class="py-8 text-center text-surface-500">No hay registros.</td>
    </tr>
  </ng-template>
</p-table>
```

---

## Formularios

Reglas:

- Labels en español si son visibles para usuario final/admin.
- Variables, clases, métodos y archivos en inglés.
- Mostrar errores cerca del campo.
- Deshabilitar submit durante guardado.
- Mantener crear/editar en el mismo diálogo si el formulario es similar.

Evitar formularios enormes en una sola columna en desktop. Usar grids simples:

```html
<div class="grid gap-4 md:grid-cols-2">
  <div class="flex flex-col gap-2">
    <label for="name">Nombre</label>
    <input id="name" pInputText />
  </div>
</div>
```

---

## Diálogos

Usar `p-dialog` para:

- Crear/editar registros.
- Vista de detalle cuando no requiere ruta propia.
- Confirmaciones complejas si `p-confirmdialog` no alcanza.

Buenas prácticas:

- Título específico: `Nuevo evento`, `Editar evento`, `Detalle del evento`.
- Footer con cancelar + acción primaria.
- `modal="true"`.
- Ancho responsive con Tailwind o `style` controlado.
- Cerrar solo al completar guardado exitoso.

---

## Accesibilidad

- Todo botón solo-icono debe tener `aria-label` o `ariaLabel`.
- Inputs deben tener `label` asociado.
- No comunicar estados solo por color.
- Mantener foco razonable al abrir/cerrar diálogos.
- Textos de acción claros: `Eliminar`, `Guardar cambios`, `Cancelar`.

---

## Anti-Patrones UI

- Copiar el template inicial de Angular en páginas reales.
- Usar tablas sin estado vacío.
- Usar iconos sin label accesible.
- Crear CSS global para un caso local.
- Meter toda la pantalla en un único componente cuando hay tabla, diálogo y formulario con responsabilidades separables.
- Introducir estilos arbitrarios complejos antes de intentar resolver con PrimeNG + Tailwind estándar.
