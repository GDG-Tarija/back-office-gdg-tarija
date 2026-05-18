# Features

Each feature follows this internal structure:

```
features/<feature-name>/
├── data/           # HTTP services, DTOs, mappers
├── domain/         # Pure models and use cases (no Angular imports)
├── presentation/
│   ├── pages/
│   └── components/
└── <feature-name>.routes.ts
```

Register a new feature in `app.routes.ts` using lazy loading:

```ts
{
  path: 'feature-name',
  loadChildren: () =>
    import('./features/feature-name/feature-name.routes').then(m => m.FEATURE_NAME_ROUTES)
}
```
