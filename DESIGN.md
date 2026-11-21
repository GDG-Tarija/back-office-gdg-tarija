---
name: Back Office GDG Tarija
description: Panel administrativo denso y consistente para la comunidad GDG Tarija (PrimeNG Aura + Tailwind v4, identidad Google).
colors:
  google-blue: '#4285f4'
  google-red: '#ea4335'
  google-yellow: '#fbbc05'
  google-green: '#34a853'
  google-blue-dark: '#174ea6'
  google-red-dark: '#a50e0e'
  google-yellow-dark: '#7a4100'
  google-green-dark: '#0d652d'
  action: '#1967d2'
  action-hover: '#185abc'
  on-action: '#ffffff'
  accent-text: '#1967d2'
  danger-text: '#c5221f'
  text-primary: '#212121'
  text-secondary: '#424242'
  text-muted: '#666666'
  surface-main: '#f8f9fa'
  surface-paper: '#ffffff'
  border: '#e0e0e0'
  success-bg: '#e6f4ea'
  success-text: '#0d652d'
  warning-bg: '#fef7e0'
  warning-text: '#7a4100'
  error-bg: '#fce8e6'
  error-text: '#a50e0e'
  info-bg: '#e8f0fe'
  info-text: '#174ea6'
  dark-surface-main: '#111827'
  dark-surface-paper: '#171717'
  dark-action: '#8ab4f8'
  dark-text-primary: '#e8e8e8'
typography:
  display:
    fontFamily: 'Google Sans, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Google Sans, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: 'Google Sans, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Google Sans, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 700
    letterSpacing: '0.05em'
rounded:
  md: '0.75rem'
  lg: '1rem'
  xl: '1.5rem'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.on-action}'
    rounded: '{rounded.full}'
    height: '44px'
    padding: '0 20px'
  button-primary-hover:
    backgroundColor: '{colors.action-hover}'
  input:
    backgroundColor: '{colors.surface-paper}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.md}'
    height: '44px'
  card:
    backgroundColor: '{colors.surface-paper}'
    rounded: '{rounded.lg}'
    padding: '16px'
  tag-success:
    backgroundColor: '{colors.success-bg}'
    textColor: '{colors.success-text}'
    rounded: '{rounded.full}'
---

# Design System: Back Office GDG Tarija

## Overview

**Modo Impeccable: Operate.** Es una app de administración para organizadores y staff de GDG Tarija (ver `PRODUCT.md`). Manda la familiaridad, la consistencia y la densidad útil; la expresión visual va después. La identidad GDG vive en los colores Google, en Google Sans y en los botones de píldora; todo lo demás es PrimeNG Aura con un preset propio.

Principios que el código ya respeta:

- **Un solo producto.** Mismo encabezado de página, mismos diálogos, mismos tags y mismo vocabulario en Inicio, Eventos, Gestión, Asistentes y Check-in.
- **Sin sorpresas al perder datos.** Todo lo editable avisa antes de descartar (`DialogFrame` con `dirty`, `UnsavedChanges`/`canDeactivate`).
- **Móvil de verdad.** Las tablas pasan a tarjetas en ≤ 768 px, los objetivos táctiles miden ≥ 44 px y no hay scroll horizontal de página.
- **Español, tuteo.** Moneda "Bs", sin voseo ni usted; "Check-in" es término del dominio.

## Colors

Fuente única: `src/styles/_tokens.scss` (`@theme static`, tema claro) y `src/styles/_variables.scss` (tema oscuro bajo `[data-theme='dark']`). Los preset de PrimeNG (`src/app/core/config/primeng-preset.ts`) usan la misma escala de azul (500 = `#4285f4`).

- **Marca (`google-*`)**: azul, rojo, amarillo y verde de Google. Sirven para acentos, fondos pastel (`*-light`) y gráficos. **Nunca como color de texto sobre claro**: para texto de marca usar `google-*-dark` (AA).
- **Acción (`action`, `on-action`)**: `#1967d2` con texto blanco (5,4:1). El `#4285f4` puro solo da 3,6:1, por eso no es el fondo de botón.
- **Texto**: `text-primary`, `text-secondary`, `text-muted`, `placeholder`; `accent-text` para enlaces/acentos y `danger-text` para acciones destructivas.
- **Estados semánticos**: pares `*-bg` + `*-text` (success, warning, error, info), todos AA en claro y oscuro. Los tags de estado los usan vía `severity` de `p-tag`.
- **Superficies**: `surface-main` (fondo de página), `surface-paper` (tarjetas, tablas, diálogos) y `border`.
- **Tema oscuro**: se activa con `data-theme="dark"` en `<html>` (`ThemeService`, clave `mecha-theme`). Se escribe con la variante Tailwind `dark:` (`@custom-variant dark` sobre el atributo) o con los tokens, que ya cambian solos.
- Los alias `--gdg-google-*` fueron retirados: usar `--color-google-*`.

## Typography

- **Familia**: Google Sans, con respaldo `system-ui`. Solo se cargan los pesos 400, 500 y 700 (`@font-face` en `styles.scss`).
- **Pesos**: `semibold`, `extrabold` y `black` se resuelven a 700 (tokens `--font-weight-*`). No esperar pesos intermedios reales: la jerarquía se hace con tamaño y color.
- **Encabezado de página (`h1`)**: `text-2xl font-bold tracking-tight`, igual en Inicio, Eventos, Nuevo evento y la cabecera de evento. Subtítulo `text-sm text-text-secondary`.
- **Cuerpo**: `text-sm` (0,875 rem). Tablas: 0,8125 rem en celdas y 0,75 rem en cabeceras en mayúsculas con `tracking-wide`.
- **Etiquetas y ayudas**: `text-xs` con `font-semibold`; no bajar de 12 px.
- **Cifras** (precios, conteos): pipe `bs` para dinero ("Bs 20"), `tabular-nums` cuando se alinean columnas.
- **Iconos**: Material Symbols Rounded (`.material-symbols-rounded`, `aria-hidden="true"` si son decorativos). No se usa PrimeIcons. La fuente se carga con ejes fijos (`opsz 24, wght 400, FILL 1, GRAD 0`, ~460 KB en lugar de 5,4 MB); el hueco del icono mide `1em` mientras carga para no mover el layout.

## Layout

- Shell: `AdminLayout` con barra lateral fija de 16 rem en ≥ md y drawer en móvil (Escape y el botón de cerrar lo cierran; enlace "Saltar al contenido" al inicio).
- Contenedor de página: `p-4 sm:p-6/8`, `max-w-6xl` en Inicio; cabecera `flex-col` en móvil y `sm:flex-row sm:justify-between` en escritorio (título + subtítulo a la izquierda, acción primaria a la derecha).
- Pantallas de un evento: `EventHeader` (migas, título, tag Publicado/Borrador, fechas, acciones y las secciones Resumen · Configuración · Asistentes · Check-in). En ≥ xl las secciones van a la derecha del título y las acciones debajo de ellas; más angosto, título | acciones y las secciones en su propia fila. El **Resumen** (`/events/:id`) es la portada y el destino del listado; Configuración suma `EventSectionNav` (pestañas o pasos con `?tab=` y `setup=1` en la URL).
- Listados: búsqueda y filtros en una barra propia sobre la tabla (nunca dentro de su superficie: `p-table` ya trae borde y radio). Campos de filtro con icono a la izquierda y tinte azul cuando están aplicados (`shared/utils/filter-field.ts`); la fila entera abre el detalle y las acciones secundarias van en `⋮`.
- Espaciado: escala de Tailwind (`gap-2/3/4/6`); secciones separadas por `space-y-6`.
- **Tabla → tarjetas**: Eventos y Asistentes usan `mediaQuerySignal(MOBILE_QUERY)` (≤ 768 px) para renderizar tarjetas apiladas en lugar de `p-table`. Ninguna pantalla debe desbordar horizontalmente a 390 px.
- Objetivos táctiles: `min-h-11`/`size-11` (44 px) en botones, enlaces del shell, `p-select` y `p-datepicker`.

## Elevation & Depth

Plano por defecto: bordes finos (`border-black/5`, `dark:border-white/5`) en lugar de sombras. Sombras solo en superficies flotantes: menús y popovers (`0 8px 24px` suave), diálogos y el enlace de salto. Los diálogos usan máscara oscura al 40 % (sin blur decorativo).

## Shapes

- Botones y chips: píldora (`rounded-full`).
- Inputs, selects y datepickers: 0,75 rem (`rounded-xl`); altura 2,5 rem global, 44 px en pantallas táctiles.
- Tarjetas: `rounded-2xl`; tablas `p-datatable`: 1,5 rem con borde fino.
- Overlays (select, popover): 0,875 rem.

## Components

- **Botón primario**: píldora azul `action`, texto `on-action`, `min-h-11`. Secundario: tono `google-blue-light` con `accent-text`. Destructivo: `danger-text` / severity `danger`.
- **Diálogos**: se cierran con X, Esc y clic fuera (salvo mientras guardan o si piden una decisión, como "¿Descartar cambios?"). En un `p-dialog` directo: `[dismissableMask]` (requiere `closable`).
- **`DialogFrame`** (`shared/components/dialog-frame`): envoltorio sobre `p-dialog` con título, icono, tamaños `sm|md|lg`, maximizar y la entrada `dirty`: si hay cambios, cerrar (X, Esc o máscara) abre "¿Descartar cambios?". Gestiona foco, `role="dialog"` y `aria-modal` por PrimeNG.
- **`FeedbackService`** (`core/services`): `success()`, `error()` y `confirm({titulo, mensaje, aceptar, peligro})` → `Promise<boolean>`. `p-toast` y `p-confirmdialog` viven en `AdminLayout`; no instanciar otros.
- **`UnsavedChangesDialog`** + `unsavedChangesGuard` (`CanDeactivate`): páginas con formulario implementan `CanLeave.canLeave()` y ofrecen Guardar / Descartar / Seguir editando.
- **`p-tag` de estado**: `Publicado` (success) / `Borrador` (secondary) en eventos; `Confirmada` (success), `Pendiente de pago` (warn), `Anulada` (danger) en inscripciones; el rol usa su propia severidad. Siempre texto + color, nunca solo color.
- **Tablas**: `p-table` con paginación, orden y estado vacío; icono de acción de 16 px; columna de acciones final.
- **Check-in**: el resultado del QR/manual es una pantalla completa (verde = registrado con vibración y "Deshacer", ámbar/rojo = requiere atención con motivo y qué hacer).
- **Métricas de Inicio**: una franja (`DashboardMetrics`) con celdas separadas por líneas de 1 px (`gap-px` sobre el color del borde), icono de 18 px en un chip de 32 px, cifra `text-2xl tabular-nums` y una línea de detalle con su estado. La bandeja "Requiere atención" usa la misma técnica en tres columnas, con filas enlazadas (`chevron_right`) y conteos en píldora del tono semántico.
- `ErrorSummary` (resumen de errores con enlaces a los campos) y `PublishChecklist`.

## Do's and Don'ts

**Hacer**

- Usar tokens (`bg-action`, `text-text-secondary`, `bg-success-bg`) en lugar de hex sueltos.
- Dejar que las utilidades de Tailwind ganen a PrimeNG con el orden de capas; para personalizar PrimeNG globalmente, hacerlo en `@layer components` de `styles.scss`.
- Mensajes de error de servidor con `toUserMessage(err, fallback, contexto)`.
- Dinero con el pipe `bs`; estados y roles con las opciones de dominio (`REGISTRATION_STATUS_OPTIONS`, `ATTENDEE_ROLE_OPTIONS`).

**Evitar**

- `!important` y utilidades `!`: con `cssLayer.order` (`theme, base, primeng, components, utilities`) no hacen falta. Excepciones documentadas: reducción de movimiento, tamaño de icono en tablas (`styles.scss`) y el `<video>` del lector QR.
- Texto en `google-*` sobre claro, degradados en texto, tarjetas anidadas, `h1` con degradado.
- "BOB", "Dashboard", "Cancelar inscripción", voseo ("podés", "elegí") o usted.
- Introducir otra librería de iconos o de UI.
