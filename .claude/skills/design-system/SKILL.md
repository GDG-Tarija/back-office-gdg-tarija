---
name: design-system
description: Sistema visual del Back Office GDG Tarija con PrimeNG Aura, Tailwind CSS v4, capas CSS, Material Symbols, DialogFrame, FeedbackService, tablas que pasan a tarjetas en móvil y vocabulario único.
---

# Sistema De Diseño

Usar esta skill cuando la tarea toque UI, layout, PrimeNG, Tailwind, tablas, formularios, diálogos, navegación o experiencia administrativa. La descripción completa de tokens y patrones está en `DESIGN.md` (raíz); el producto y sus usuarios en `PRODUCT.md`. Modo Impeccable: **Operate** (familiaridad, consistencia y densidad útil por encima de expresión).

---

## Principios

- Back-office administrativo, denso y claro; PrimeNG para componentes ricos, Tailwind para composición.
- Consistencia antes que patrones nuevos: antes de crear algo, buscar el equivalente en `shared/` o en otra pantalla.
- Cero pérdida de datos silenciosa: lo editable avisa antes de descartar.
- Móvil de verdad: sin scroll horizontal de página a 390 px y objetivos táctiles de 44 px.

---

## Stack UI

- **PrimeNG 21** con preset propio sobre Aura (`core/config/primeng-preset.ts`, escala de azul GDG).
- **Tailwind CSS v4** (`@theme static` en `src/styles/_tokens.scss`) + **tailwindcss-primeui**.
- **Material Symbols Rounded** como único set de iconos: `<span class="material-symbols-rounded" aria-hidden="true">add</span>`. **No usar PrimeIcons** (`pi pi-*`); en `p-button` usar `<ng-template #icon>` y en `MenuItem` un `<ng-template #item>` que pinte el glifo.
- **Google Sans** (400/500/700). `font-semibold|extrabold|black` se resuelven a 700.

### Capas CSS

`src/styles/_layers.css` declara `@layer theme, base, primeng, components, utilities;` y `app.config.ts` lo respeta con `cssLayer: { name: 'primeng', order: … }`. Consecuencias:

- Las utilidades de Tailwind **ganan** a PrimeNG sin `!`. No escribir `!rounded-xl`, `!px-*`, `!important`.
- Overrides globales de PrimeNG: en `@layer components` dentro de `styles.scss`, no en SCSS de componente con `::ng-deep` + `!important`.
- Excepciones aceptadas: reducción de movimiento, tamaño de icono en `p-datatable` y el `<video>` del lector QR (CSS de librería sin capas).

### Tokens

- Colores de marca `--color-google-*` (+ `-light` pastel, `-dark` para texto AA). Los alias `--gdg-google-*` ya no existen.
- Semánticos: `action`/`on-action`, `accent-text`, `danger-text`, `success|warning|error|info-{bg,text}`, `surface-main|paper`, `border`, `text-primary|secondary|muted`. Tema oscuro en `[data-theme='dark']` (`_variables.scss`), variante `dark:` en Tailwind.
- Texto de color sobre fondo claro: `google-*-dark` o los pares semánticos, nunca `google-*` puro.

---

## Layout administrativo

```html
<div class="space-y-6 p-4 sm:p-8">
  <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-text-primary dark:text-neutral-100">
        Eventos
      </h1>
      <p class="mt-1 text-sm text-text-secondary dark:text-neutral-400">Subtítulo de una línea.</p>
    </div>
    <a
      class="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 text-sm font-semibold text-on-action"
      >…</a
    >
  </header>
  …
</div>
```

- Un `h1` por pantalla, mismo estilo en Inicio, Eventos, Nuevo evento y Gestión (sin degradados ni tarjetas anidadas).
- **Cabecera de evento** (`EventHeader`): migas, título, tag Publicado/Borrador, fechas y acciones proyectadas con `<ng-content>`. Debajo, `EventSectionNav` (pestañas en gestión, pasos con `setup=1` durante el alta). La pestaña vive en `?tab=` (`parseEventTab`, `EVENT_TABS` en `domain/event-tabs.ts`).
- Estados `loading`, `empty` y `error` explícitos en cada lista.

---

## Tablas y tarjetas en móvil

- `p-table` con paginación, orden, filtro y estado vacío; columna de acciones al final con botones solo-icono con `aria-label`.
- **≤ 768 px las filas pasan a tarjetas** (Eventos, Asistentes): `readonly isMobile = mediaQuerySignal(MOBILE_QUERY)` (`shared/utils/media-query.ts`) y `@if (isMobile()) { …tarjetas… } @else { <p-table> }`. Nunca depender de scroll horizontal para acciones.
- Tags de estado con `p-tag`: texto + `severity`; las opciones salen del dominio (`REGISTRATION_STATUS_OPTIONS`, `ATTENDEE_ROLE_OPTIONS`), no se escriben a mano.

---

## Formularios

- Labels visibles y asociados; errores junto al campo; `ErrorSummary` (`shared/components/error-summary`) para resumir y enlazar errores.
- Submit deshabilitado mientras guarda. Inputs de 44 px de alto en táctil (regla global en `styles.scss`).
- Variables, clases y archivos en inglés; textos visibles en español.
- Formularios con trabajo sin guardar: implementan `CanLeave` y usan `unsavedChangesGuard` en la ruta (`canDeactivate`); el aviso "Guardar / Descartar / Seguir editando" es `UnsavedChangesDialog` con `UnsavedPrompt`. Cambiar de pestaña con cambios también pregunta (`runGuardsAndResolvers: 'always'`).
- Errores del servidor: `toUserMessage(err, 'No se pudo guardar el paquete.', 'ticket_type')` (`events/data/postgres-error.mapper.ts`), nunca el mensaje crudo de Postgres.

---

## Diálogos y feedback

- **Diálogos de formulario/detalle**: `<app-dialog-frame>` (`shared/components/dialog-frame`) sobre `p-dialog`. Entradas `title`, `icon`, `initialSize` (`sm|md|lg`) y **`dirty`**: con `dirty` en `true`, X, Escape o clic en la máscara piden confirmación antes de emitir `closeDialog`. Footer con Cancelar + acción primaria; cerrar solo tras guardar con éxito.
- **Toasts y confirmaciones**: inyectar `FeedbackService` (`core/services/feedback.service.ts`): `success(msg)`, `error(msg)` y `confirm({ titulo, mensaje, aceptar, peligro })` que devuelve `Promise<boolean>`. `p-toast` y `p-confirmdialog` ya viven en `AdminLayout`; no agregar otros ni usar `MessageService`/`ConfirmationService` directamente.
- Confirmar siempre acciones destructivas nombrando la entidad y su consecuencia ("Despublicar con N personas inscritas").
- Escape cierra drawer y diálogos; el foco vuelve al disparador.

---

## Vocabulario y tono (obligatorio)

- Interfaz 100 % en español, **tuteo** (nada de voseo ni usted).
- Moneda: pipe `bs` (`shared/pipes/bs.pipe.ts`, `formatBs`) → "Bs 20". Nunca "BOB".
- **Capacidad** del evento; **Cupo** de paquete o fase.
- Inscripción: **Confirmada / Pendiente de pago / Anulada** (plural Confirmadas / Pendientes de pago / Anuladas). Acción **"Anular"**, no "Cancelar inscripción".
- Personas: "personas inscritas" / "inscripciones"; roles: Asistente, Expositor, … (`ATTENDEE_ROLE_OPTIONS`). Evento: Publicado / Borrador.
- Términos del dominio que se mantienen: "Check-in", "Staff". Sin "Dashboard" (se llama **Inicio**), "WORKSHOP", etc.

---

## Check-in

Un QR válido de una inscripción Confirmada se registra al instante: resultado verde a pantalla completa, vibración y "Deshacer" unos segundos. Pendiente, Anulada, Ya registrado u otro evento muestran resultado ámbar/rojo con motivo y qué hacer. STAFF entra directo a `/checkin` con su evento preseleccionado (`domain/event-preselection.ts`); el Inicio queda oculto para STAFF (`homeGuard`).

---

## Accesibilidad

- Botón solo-icono con `aria-label`; iconos decorativos `aria-hidden="true"`.
- Objetivos táctiles ≥ 44 px (`min-h-11`, `size-11`), incluido el shell (logo, cerrar menú, "Saltar al contenido").
- Estados nunca solo por color; foco visible y razonable al abrir/cerrar overlays.
- Contraste AA en claro y oscuro: usar solo los tokens documentados.

---

## Anti-patrones

- `!important` / `!clase` para ganar a PrimeNG (ya no hace falta).
- PrimeIcons, Angular Material, Bootstrap u otra librería de UI.
- `h1` con degradado, tarjetas dentro de tarjetas, hex sueltos, `google-*` como color de texto.
- Diálogos propios con `position: fixed` en lugar de `DialogFrame`; toasts con `MessageService` directo.
- Tablas que fuerzan scroll horizontal en móvil.
- Textos con "BOB", voseo, "Cancelar inscripción" o "Dashboard".
- CSS global para un caso local; pantallas gigantes sin dividir en componentes.
