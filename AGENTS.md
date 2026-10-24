# AGENTS.md

> Instrucciones para agentes de IA trabajando en este repositorio.

Este es el proyecto **Back Office GDG Tarija**, una aplicación administrativa table-heavy para gestionar datos de la comunidad GDG Tarija.

---

## Ramas (obligatorio)

- **`main` no se toca.** Nunca hagas commit, push, merge ni rebase directo a `main`. `main` es producción: solo recibe PRs de release `dev → main`, que mergea un organizador.
- Todo trabajo va en una rama creada desde `dev` (`feat/…`, `fix/…`, `chore/…`) y entra por PR **contra `dev`**.
- Antes de empezar: `git checkout dev && git pull`, y luego `npm run db:migrate` para tener la base local al día.

---

## Levantar el proyecto en local

Requisitos: Docker corriendo (≥ 4 GB de RAM), Node 22, y `back-office-gdg-tarija` y `eventos-gdg-tarija` clonados en la misma carpeta, en la rama `dev`.

```bash
# 1. Base de datos local (desde este repo)
npm install                                   # incluye el CLI de Supabase (versión fijada)
cp supabase/.env.example supabase/.env        # client ID + secret de Google: pedirlos a un organizador
npm run db:start                              # Supabase local: migraciones + seed ficticio

# 2. Back-office
cp src/environments/environment.eg.ts src/environments/environment.ts
npm start                                     # http://localhost:4300

# 3. Eventos (en ../eventos-gdg-tarija)
npm install
cp src/environments/environment.eg.ts src/environments/environment.ts
npm start                                     # http://localhost:4200
```

- Studio local: http://127.0.0.1:54323. API: http://127.0.0.1:54321.
- Primer login con Google → en el Studio: `insert into public.staff_whitelist (email, role) values ('tu-correo@gmail.com', 'SUPERADMIN');`
- Al terminar: `npm run db:stop`.
- Detalle completo (flujo de migraciones, releases, backups): `docs/entornos-supabase.md`.

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

# Supabase local (requiere Docker)
npm run db:start             # levanta Supabase local con migraciones + seed
npm run db:stop              # lo apaga
npm run db:status            # URLs y keys locales
npm run db:reset             # recrea la base local desde cero (migraciones + seed)
npm run db:migrate           # aplica solo las migraciones nuevas, conserva los datos locales
npm run db:new -- <nombre>   # nueva migración en supabase/migrations/
npx supabase gen types typescript --local   # tipos para src/app/core/supabase/supabase.client.ts
```

> `npm start` y `npm run build` ejecutan `scripts/set-env.js` antes de `ng`. Para compilar sin tocar `environment*.ts` usar `npx ng build`.

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

## Base de datos y migraciones

- Este repo es **dueño de `supabase/`** (eventos-gdg-tarija ya no guarda copia). Toda migración nueva se crea con `npm run db:new -- <nombre>` y se prueba con `npm run db:reset`.
- **Entornos** (ver `docs/entornos-supabase.md`): solo local (Docker, datos ficticios de `supabase/seed.sql`) y prod (se actualiza con el release `dev → main`, con aprobación manual). La rama `dev` no tiene base en la nube. `src/environments/environment.ts` apunta a local, **nunca a prod**.
- **La base va primero:** al mergear el release `dev → main`, Vercel publica el código y la migración espera aprobación. En el release, back-office va primero (y se aprueba la base enseguida) y eventos después. Si un cambio quita o restringe algo (borrar columna, policy más estricta), va en dos releases: primero el código que deja de usarlo, luego la migración.
- **Nunca** cambiar el schema de prod a mano: nada de SQL Editor, `apply_migration`/`execute_sql` del MCP ni `supabase db push` desde una máquina local. Solo vía los workflows `db-deploy-*`.
- Fuente de verdad del schema: `supabase/migrations/20261024032707_baseline.sql` + posteriores. Si alguien mergeó a `dev` una migración más nueva que la tuya, renombra la tuya con un timestamp nuevo antes del PR.
- Si agregas una tabla, agrega datos ficticios en `supabase/seed.sql`.
- Esquema, RLS y funciones documentados en `.claude/skills/database/SKILL.md` (gemelo en `.opencode/skills/`): leerlo antes de usar una tabla o columna y actualizarlo con cada migración.
- Rol del operador: `get_my_role()` vía `staff_whitelist` (SUPERADMIN escribe; STAFF lee y hace check-in en eventos asignados). Ya no existe `AUTH_WHITELIST` ni `is_staff()` en el back-office.
- `20261024155150_close_coupon_read_leak.sql` solo se aprueba en prod tras desplegar el checkout público con `rpc validate_coupon`.
- Guía de usuario del módulo de eventos: `docs/gestion-de-eventos.md`.

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
