# Back Office GDG Tarija

Aplicación administrativa de GDG Tarija para gestionar eventos (creación, paquetes, sesiones, cupones, staff, asistentes) y hacer check-in. Convive con la app pública [eventos-gdg-tarija](../eventos-gdg-tarija) sobre el mismo proyecto Supabase.

Stack: Angular 21 (standalone, signals, zoneless), PrimeNG 21, Tailwind v4, Supabase, Vitest.

## Requisitos

- Node 22 y npm 10 (`packageManager: npm@10.9.4`).
- Docker Desktop (u OrbStack/Colima) corriendo, para el Supabase local.
- Para el back-office: tu email en `staff_whitelist` con rol `SUPERADMIN` o `STAFF`.

## Entorno local

Se desarrolla contra un **Supabase local** con datos ficticios, nunca contra producción, y siempre en
una rama creada desde `dev` (`main` no se toca: solo recibe releases `dev → main`).

```bash
npm install                                     # incluye el CLI de Supabase (versión fijada)
cp supabase/.env.example supabase/.env          # OAuth de Google: pídelo a un organizador
npm run db:start                                # Supabase local: migraciones + seed
cp src/environments/environment.eg.ts src/environments/environment.ts
npm start                                       # http://localhost:4300
```

Studio local: http://127.0.0.1:54323. Para volverte SUPERADMIN, ver
[docs/entornos-supabase.md](docs/entornos-supabase.md), que explica también el flujo de migraciones
a producción y los backups.

`scripts/set-env.js` (lo ejecutan `npm start`, `npm run build` y `npm run vercel-build`) sobrescribe
`environment.ts` y `environment.prod.ts` si existen las variables de entorno `SUPABASE_URL` y
`SUPABASE_KEY` (o `SUPABASE_ANON_KEY`). No las tengas exportadas con valores de producción en tu shell.

## Comandos

```bash
npm start              # set-env + ng serve -> http://localhost:4300
npx ng build           # build sin ejecutar set-env.js
npm run build          # set-env + build de producción
npm test               # Vitest
npm run lint           # ESLint (lint:fix para autofix)
npm run format:check   # Prettier

npm run db:start       # levanta Supabase local (db:stop para apagarlo, db:status para ver URLs y keys)
npm run db:reset       # recrea la base local: migraciones + seed
npm run db:migrate     # aplica solo las migraciones nuevas (tras un git pull de dev)
npm run db:new -- x    # nueva migración supabase/migrations/<timestamp>_x.sql
```

## Migraciones (regla)

Este repo es **dueño de `supabase/`** (eventos-gdg-tarija ya no guarda copia). Toda migración nueva
se crea con `npm run db:new`, se prueba con `npm run db:reset` y llega a producción **solo por PR**:
PR a `dev`, y el release `dev → main` la aplica en prod tras aprobación manual. Documenta
los cambios de esquema en `.claude/skills/database/SKILL.md`. Las migraciones que dependen de un
despliegue previo llevan un aviso en la cabecera.

## Documentación

- `docs/entornos-supabase.md`: entornos local y prod, flujo de migraciones, backups y restauración.
- `docs/gestion-de-eventos.md`: guía de usuario y checklist de pruebas del módulo de eventos.
- `AGENTS.md` y `CONTEXT.md`: reglas para agentes y contexto del proyecto.
- `.claude/skills/`: esquema de BD, arquitectura, sistema de diseño y features.
