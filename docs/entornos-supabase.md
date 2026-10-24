# Entornos de Supabase: local y producción

Ambas apps (`eventos-gdg-tarija` y `back-office-gdg-tarija`) comparten una base Supabase. Para que
nadie rompa producción mientras desarrolla, hay dos entornos:

| Entorno | Dónde | Quién entra | Datos | Cómo llegan los cambios |
|---|---|---|---|---|
| **Local** | La máquina de cada dev (Docker) | Cada dev | Ficticios (`supabase/seed.sql`) | `npm run db:reset` cuando quiera |
| **Prod** | Proyecto `gdgtarija` (org `gdg-tarija`) | Solo organizadores | Reales | Release `dev → main`, **con aprobación manual** |

Reglas:

- `src/environments/environment.ts` apunta a **local**. Nunca a prod.
- Nadie trabaja en `main`: todo va en una rama creada desde `dev` y entra por PR a `dev`.
- El schema solo cambia con migraciones en `supabase/migrations/`, vía PR. Nada de cambios a mano en
  el SQL Editor, el Studio o el MCP de prod.
- Los agentes de IA (Claude Code, opencode…) usan el MCP local (`http://127.0.0.1:54321/mcp`). El MCP
  de prod, si hace falta, en modo `read_only=true`.
- `supabase/` vive solo en este repo; eventos-gdg-tarija no guarda migraciones.
- El entorno local no consume nada del plan de Supabase (ni cuota ni proyectos): todo corre en Docker.

---

## Entorno local (≈10 minutos)

Requisitos: Docker Desktop (u OrbStack/Colima) corriendo con al menos 4 GB de RAM asignados, Node 22,
y este repo clonado junto a `eventos-gdg-tarija`, los dos en la rama `dev`.

```bash
npm install                     # instala también el CLI de Supabase (versión fijada)
cp supabase/.env.example supabase/.env   # pide los valores del OAuth de Google a un organizador
npm run db:start                # Postgres + Auth + Storage + Studio, con migraciones y seed
cp src/environments/environment.eg.ts src/environments/environment.ts
npm start                       # back-office → http://localhost:4300
```

En `eventos-gdg-tarija`: `cp src/environments/environment.eg.ts src/environments/environment.ts` y
`npm start` → http://localhost:4200. Las dos apps usan el mismo Supabase local.

| Servicio | URL |
|---|---|
| API | http://127.0.0.1:54321 |
| Studio (tablas, SQL editor) | http://127.0.0.1:54323 |
| Mailpit (correos de prueba) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

**Login:** las apps solo usan Google. Sin `supabase/.env` el stack levanta igual, pero el botón de
Google falla. Los usuarios del seed (`*@gdg-tarija.test`, `*@ejemplo.test`) son solo datos: no pueden
iniciar sesión.

**Volverte SUPERADMIN en local:** entra una vez con tu Google y luego, en el Studio → SQL Editor:

```sql
insert into public.staff_whitelist (email, role) values ('tu-correo@gmail.com', 'SUPERADMIN');
```

**Apágalo cuando no lo uses:** `npm run db:stop` libera la memoria. Los datos locales se conservan
hasta el próximo `db:reset`.

## Ramas: `main` no se toca

| Rama | Para qué | Quién escribe |
|---|---|---|
| `main` | Producción. Vercel publica desde aquí y desde aquí salen las migraciones a prod. | Nadie directo: solo PRs de release `dev → main`, mergeados por un organizador |
| `dev` | Integración: lo que va a salir en el próximo release | Solo vía PR desde una rama de trabajo |
| `feat/…`, `fix/…`, `chore/…` | Tu trabajo | Tú, creada desde `dev` |

### Ciclo diario

```bash
git checkout dev && git pull               # (en los dos repos)
git checkout -b feat/mi-cambio
npm run db:start                           # en back-office, si no está corriendo
npm run db:migrate                         # aplica las migraciones que otros mergearon
# …programas y pruebas contra el Supabase local…
git push -u origin feat/mi-cambio          # y abres el PR contra dev
```

Si tu cambio necesita algo nuevo en la base (en back-office):

```bash
npm run db:new -- agregar_x                # crea supabase/migrations/<timestamp>_agregar_x.sql
# escribe el SQL…
npm run db:reset                           # recrea la base local desde cero: migraciones + seed
npx supabase gen types typescript --local  # actualiza el tipo Database (y cópialo a eventos)
```

¿Cambiaste algo en el Studio local y quieres la migración? `npx supabase db diff -f nombre`.
¿Rompiste tu base local? `npm run db:reset` y vuelves al estado limpio.

### Mantenerse al día con la base

La estructura de la base **es** la carpeta `supabase/migrations/` de back-office: no hace falta clonar
nada de prod. Estar al día = tener las últimas migraciones de `dev` aplicadas en tu Supabase local.

```bash
cd back-office-gdg-tarija
git checkout dev && git pull
npm run db:migrate    # aplica SOLO las migraciones nuevas y conserva tus datos locales
# o, si algo no cuadra:
npm run db:reset      # borra tu base local y la recrea: todas las migraciones + seed
```

- El tipo `Database` (`supabase.client.ts`) también está en git: quien crea la migración commitea los
  tipos regenerados en los dos repos, y tú los recibes con `git pull`.
- **Choque de timestamps:** si mientras trabajabas alguien mergeó a `dev` una migración más nueva que
  la tuya, renombra la tuya antes del PR (`npm run db:new -- mismo_nombre`, mueve el SQL y borra el
  archivo viejo). Prod rechaza migraciones "anteriores" a la última aplicada.
- Los datos locales son siempre ficticios (`supabase/seed.sql`). Si agregas una tabla, agrega también
  algunos datos de ejemplo al seed para el resto del equipo.

---

## Cómo llega un cambio a producción

```
feat/x ──PR──▶ dev ──PR de release──▶ main ─┬─▶ Vercel publica el código       (automático)
   │                                         └─▶ DB deploy (prod) espera tu OK  → aplica migraciones
   └─ DB CI re-aplica todas las migraciones + seed en un Postgres vacío (verde = ok)
```

| Qué | Cómo se publica | ¿Espera aprobación? |
|---|---|---|
| **Código** de eventos o back-office | Vercel, al mergear a `main` de cada repo (y una *preview* por cada PR y por `dev`) | No: es automático |
| **Base de datos** (migraciones) | Workflow `DB deploy (prod)` de back-office, al mergear a `main` | **Sí**, de un organizador |

Las migraciones viven solo en back-office, aunque el cambio sea para eventos. Las previews de Vercel
usan la base de **producción** (no hay otra en la nube): sirven para ver la UI, no para crear datos
de prueba.

### Release (`dev → main`)

1. PR `dev → main` en **back-office** → merge → **aprueba enseguida** el deploy de la base
   (GitHub → Actions → `DB deploy (prod)` → Review deployments). Vercel tarda 1–2 min en publicar:
   así la base queda lista casi al mismo tiempo que el código.
2. Con la migración ya aplicada, PR `dev → main` en **eventos** → merge → Vercel publica.

### Regla: la base va primero

| Tipo de cambio | Ejemplos | Cómo se libera |
|---|---|---|
| **Agrega** | tabla, columna nullable, función, policy más permisiva | En un release: back-office primero (base aprobada), eventos después |
| **Quita o restringe** | borrar/renombrar columna, policy más estricta, `not null` | En dos releases: 1º el código que ya no lo usa; 2º la migración |

### Al aprobar el deploy de la base

- revisa el paso "Migraciones pendientes";
- si la migración depende de código que aún no está publicado, no apruebes todavía;
- si toca datos existentes (constraints, FKs, `not null`, cambios de tipo), haz antes el
  **ensayo con backup**.

`db push` aplica **todas** las migraciones pendientes juntas: no se puede elegir una. `dev` es lo que
sale en el próximo release: una migración que todavía no debe salir no se mergea a `dev` (queda en
su PR abierto).

### Ensayo con backup (antes de aprobar migraciones riesgosas)

El seed tiene datos ficticios; una migración puede pasar en local y fallar con los datos reales. Para
probarla contra una copia de prod, en tu máquina (solo organizadores: el backup tiene datos personales):

```bash
npm run db:start
npx supabase db reset --local --version <última versión aplicada en prod> --no-seed
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f <backup>/data.sql
npx supabase migration up --local     # aplica las migraciones pendientes sobre los datos reales
# revisa que no haya errores y que los datos se vean bien…
npm run db:reset                      # borra los datos reales de tu máquina
```

La última versión aplicada en prod la muestra el paso "Migraciones pendientes" del workflow, o la
tabla `supabase_migrations.schema_migrations`.

---

## Configuración pendiente (solo organizadores, una vez)

### 1. OAuth de Google para local

Se reutiliza el OAuth client de producción, con un secret aparte para desarrollo. En Google Cloud
Console → APIs & Services → Credentials → el client que usa Supabase prod:

- **Authorized redirect URIs:** agregar `http://127.0.0.1:54321/auth/v1/callback`, sin quitar el de prod.
- **Add secret:** crea un segundo secret solo para devs. El de prod sigue igual y Supabase prod no se toca.
  Si alguien deja el equipo o el secret se filtra, se deshabilita ese secret sin afectar producción.
- Comparte el `client_id` y el secret de desarrollo por privado; cada dev los pone en `supabase/.env`.

Los logins locales crean usuarios en el Supabase **local**, no en prod. La pantalla de consentimiento
de Google mostrará el nombre de la app de producción.

### 2. GitHub (este repo)

Configúralo **antes** de subir los workflows a `main`: si el environment no existe, GitHub lo crea
solo, sin aprobación obligatoria.

- Settings → Environments → **New environment** `db-production` (no uses `Production`: ese lo creó
  Vercel para sus deploys):
  - secret `SUPABASE_DB_URL` = connection string del **session pooler** de prod (Dashboard → Connect).
  - **Required reviewers** = organizadores.
- Settings → General → **Default branch** = `dev` (los clones y los PRs nuevos apuntan ahí).
- Settings → Branches: proteger `main` y `dev` (PR obligatorio). En los dos repos.
- Vercel (ambos repos): las variables `SUPABASE_URL` / `SUPABASE_KEY` de Preview y Production apuntan
  a prod. No uses las previews para crear datos de prueba.

Usa siempre el *session pooler* (`aws-…pooler.supabase.com:5432`): la conexión directa del plan
Free es solo IPv6 y los runners de GitHub no la alcanzan. Si la contraseña tiene caracteres
especiales, va percent-encoded en la URL.

### 3. Backups automáticos de prod

El plan Free **no tiene backups**. Se hacen con un workflow nocturno en un repo **privado**
(`GDG-Tarija/db-backups`), cifrados con [age](https://github.com/FiloSottile/age):

1. En tu máquina: `age-keygen -o gdg-backups.key`. Guarda el archivo en tu gestor de contraseñas
   (sin él no se puede descifrar) y copia la línea `public key: age1…`.
2. En el repo privado, secrets: `PROD_DB_URL` (session pooler de prod) y `AGE_PUBLIC_KEY`.
3. `.github/workflows/backup.yml`:

```yaml
name: Backup prod

on:
  schedule:
    - cron: '0 7 * * *' # 03:00 en Bolivia
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    env:
      SUPABASE_DB_URL: ${{ secrets.PROD_DB_URL }}
      AGE_RECIPIENT: ${{ secrets.AGE_PUBLIC_KEY }}
    steps:
      - uses: supabase/setup-cli@v1
        with:
          version: 2.122.0

      - name: Dump (roles, schema, datos)
        run: |
          supabase init
          mkdir backup
          supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f backup/roles.sql
          supabase db dump --db-url "$SUPABASE_DB_URL" -f backup/schema.sql
          supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
            -x storage.buckets_vectors -x storage.vector_indexes -f backup/data.sql

      - name: Cifrar
        run: |
          sudo apt-get install -y age
          tar czf - backup | age -r "$AGE_RECIPIENT" > "prod-$(date -u +%Y%m%d).tar.gz.age"

      - uses: actions/upload-artifact@v4
        with:
          name: prod-backup-${{ github.run_id }}
          path: prod-*.tar.gz.age
          retention-days: 30
```

El dump incluye la metadata de Storage, pero **no los archivos** (comprobantes de pago, imágenes).
Si hace falta, se sincronizan aparte vía el protocolo S3 de Storage.

### Restaurar un backup

```bash
age -d -i gdg-backups.key prod-AAAAMMDD.tar.gz.age | tar xzf -
# Probar primero en local:
npm run db:reset -- --no-seed
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f backup/data.sql
```

Errores esperables al restaurar en local: `buckets_pkey` (los buckets ya existen) y permisos en
`storage.buckets_vectors` / `storage.vector_indexes` (tablas internas vacías). Al terminar,
`npm run db:reset` para borrar los datos reales de tu máquina.

---

## Límites a tener en cuenta

- **Supabase Free (prod):** 500 MB de base, 1 GB de Storage, 5 GB de egress al mes. El proyecto se
  **pausa tras 7 días sin actividad**; se reactiva desde el dashboard. El desarrollo local no suma nada.
- **GitHub Actions:** gratis en repos públicos (este y eventos). El repo privado de backups usa los
  2.000 minutos/mes del plan Free; el backup diario gasta unos 3 min por corrida.

---

## Historia (2026-10-24)

- Backups manuales en `supabase/backups/` (ignorados por git; contienen datos reales): `20261023-prod/`
  (completo, previo a la línea base) y `20260815-eventos/` (parcial, de agosto).
- El historial de migraciones de prod estaba desalineado (migraciones aplicadas a mano). Se reemplazó
  por una **línea base** (`20261024032707_baseline.sql`, `supabase db pull`) y se registró como
  aplicada en prod. Las migraciones anteriores se eliminaron; siguen en el historial de git de eventos-gdg-tarija (antes del 2026-10-24).
- Un `supabase db diff` contra prod muestra solo diferencias cosméticas, que no son cambios reales:
  - 3 funciones (`process_registration_coupon`, `set_updated_at`, `update_updated_at_column`)
    tienen fin de línea CRLF en prod.
  - 6 `CHECK` que Postgres re-normaliza al re-aplicarlos.
- Ensayo con el backup del 2026-10-23: `close_coupon_read_leak` y `tracks_event_fk` se aplican sin
  errores sobre los datos reales.
