# AGENTS.md

> Instrucciones para agentes de IA trabajando en este repositorio.

Este es el proyecto **Back Office GDG Tarija**, una aplicación administrativa table-heavy para gestionar datos de la comunidad GDG Tarija.

---

## Comandos del proyecto

```bash
# Desarrollo
npm start                    # ng serve
npm run build                # build de producción
npm run watch                # build en modo watch

# Calidad
npm run lint                 # ESLint
npm run lint:fix             # ESLint con autofix
npm run format               # Prettier sobre src/
npm run format:check         # valida formato
npm test                     # Vitest / Angular unit tests
```

> Si agregas un comando nuevo en `package.json`, documentalo aquí.

---

## Stack

- **Angular 21** con standalone components, signals y zoneless change detection.
- **PrimeNG 21** con tema Aura para componentes ricos de administración.
- **Tailwind CSS v4** para layout, utilities y ajustes visuales.
- **tailwindcss-primeui** para integración de tokens PrimeNG/Tailwind.
- **Vitest** como test runner.
- **ESLint + Prettier** para calidad y formato.

---

## Reglas que el agente DEBE seguir

### Angular y arquitectura

1. **Standalone components siempre.** No crear `NgModule`.
2. **Usar signals para estado de UI.** RxJS solo cuando aporte para streams, HTTP o interoperabilidad.
3. **Zoneless-compatible.** No depender de comportamiento implícito de Zone.js.
4. **Lazy loading por feature** mediante `loadChildren` en `app.routes.ts`.
5. **Clean architecture por feature:** `data`, `domain`, `presentation`.
6. **`domain` no importa Angular.** Debe contener tipos, interfaces, reglas y casos de uso puros.
7. **`presentation` depende de `domain`, no de detalles internos de `data` cuando exista una abstracción.**
8. **`data` implementa contratos del dominio** y contiene DTOs, mappers y servicios de integración.

### UI / UX

9. **PrimeNG es la librería principal de UI.** No introducir Angular Material, Bootstrap u otro framework UI.
10. **Tailwind se usa para layout y utilities.** PrimeNG se usa para tablas, diálogos, formularios ricos, menús y overlays.
11. **Aplicación table-heavy.** Priorizar `p-table`, filtros, paginación, ordenamiento, columnas de acciones y estados vacíos.
12. **Responsive real.** Las pantallas administrativas deben funcionar en desktop y no romper en mobile/tablet.
13. **Accesibilidad.** Botones de icono llevan `aria-label`, formularios tienen labels y mensajes de error claros.

### Código

14. **TypeScript estricto.** No usar `any`; si es inevitable, justificar con comentario breve.
15. **Nombres:** `PascalCase` para clases/componentes, `camelCase` para variables/métodos, `kebab-case` para archivos y selectores.
16. **Imports ordenados:** Angular core → Angular libs → librerías externas → `core`/`shared`/`features` → relativos.
17. **Comentarios mínimos.** Comentar el porqué, no lo obvio.
18. **No mezclar cambios no relacionados.** Un cambio debe resolver una tarea concreta.

### Tests y verificación

19. **Agregar tests para lógica nueva no trivial.** Especialmente mappers, casos de uso y servicios.
20. **Para CRUDs, cubrir al menos happy-path de data/domain cuando exista lógica propia.**
21. **Antes de cerrar una tarea, correr la verificación más cercana:** `npm run lint`, `npm test` o `npm run build` según impacto.

---

## Estructura esperada

```text
src/app/
├── core/           # Servicios singleton, guards, interceptors, modelos globales
├── shared/         # Componentes, directivas, pipes y utils reutilizables
├── features/       # Features lazy-loaded
│   └── <feature>/
│       ├── data/           # HTTP services, DTOs, mappers, repositorios concretos
│       ├── domain/         # Tipos, contratos, reglas y casos de uso puros
│       └── presentation/
│           ├── pages/      # Páginas ruteables
│           └── components/ # Componentes internos de la feature
├── layouts/        # App shell layouts
├── app.config.ts
└── app.routes.ts
```

Registrar features nuevas con lazy loading:

```ts
{
  path: 'feature-name',
  loadChildren: () =>
    import('./features/feature-name/feature-name.routes').then((m) => m.FEATURE_NAME_ROUTES),
}
```

---

## Convenciones de commits

Usar Conventional Commits en español o inglés, manteniendo consistencia por PR:

```text
feat(events): agregar tabla de eventos
fix(users): corregir filtro por estado
chore(config): ajustar eslint
docs(agents): agregar skills del proyecto
refactor(layout): extraer shell administrativo
test(events): cubrir mapper de evento
```

Un PR debe ser una unidad pequeña de trabajo. No mezclar feature, refactor masivo y cambios visuales no relacionados.

---

## Flujo recomendado para tareas

1. Leer `CONTEXT.md` y este archivo si no están en contexto.
2. Identificar si la tarea afecta arquitectura, UI, rutas, datos o tests.
3. Revisar código existente antes de crear patrones nuevos.
4. Implementar el cambio mínimo correcto.
5. Agregar o ajustar tests cuando haya lógica nueva.
6. Ejecutar la verificación relevante.
7. Resumir archivos tocados, comandos corridos y supuestos.

---

## Preguntas a hacer si hay ambigüedad

- ¿Cuál es la entidad o módulo administrativo involucrado?
- ¿El dato viene de una API existente o todavía hay que definir contrato?
- ¿La pantalla pertenece a un layout administrativo, público o de autenticación?
- ¿El CRUD debe tener exportación, acciones bulk, filtros avanzados o solo tabla base?

No asumir en silencio si la decisión cambia arquitectura, contrato de datos o experiencia de usuario.
