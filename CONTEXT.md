# Back Office GDG Tarija

Administrative back-office for GDG Tarija. Table-heavy CRUD application for managing community data.

## Stack

- **Angular 21** — standalone components, zoneless change detection, signal-based
- **PrimeNG 21** — UI components (Aura theme), chosen for its rich table component (`p-table`)
- **Tailwind CSS v4** — utility styling via `@tailwindcss/postcss`, integrated with PrimeNG through `tailwindcss-primeui`
- **CSS layers:** `tailwind, primeng` — Tailwind utilities override PrimeNG when needed
- **Vitest** — test runner (Angular 21 default)

## Architecture

Clean architecture, feature-based with lazy loading:

```
src/app/
├── core/           # Singleton services, guards, interceptors, app-wide models
├── shared/         # Reusable components, directives, pipes, utils
├── features/       # Lazy-loaded features (see structure below)
└── layouts/        # App shell layouts
```

Each feature follows:

```
features/<name>/
├── data/           # HTTP services, DTOs, mappers
├── domain/         # Pure business logic (no Angular imports)
├── presentation/
│   ├── pages/
│   └── components/
└── <name>.routes.ts
```

Register a new feature in `app.routes.ts` using lazy loading:

```ts
{
  path: 'feature-name',
  loadChildren: () =>
    import('./features/feature-name/feature-name.routes').then(m => m.FEATURE_NAME_ROUTES)
}
```

**Dependency rule:** `domain` has no Angular imports. `data` implements interfaces from `domain`. `presentation` depends on `domain`, never on `data` directly.

## Conventions

- Standalone components only — no NgModules
- Lazy load every feature via `loadChildren` in `app.routes.ts`
- Component selector prefix: `app-` (kebab-case)
- Directive selector prefix: `app` (camelCase)
- Prettier: single quotes, trailing commas, 100 char width, semicolons
- ESLint: angular-eslint + prettier integration
- Pre-commit: husky + lint-staged runs prettier and eslint on staged files

## Commands

- `npm start` — dev server
- `npm run build` — production build
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm test` — Vitest
