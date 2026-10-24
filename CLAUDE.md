# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@CONTEXT.md

## Notes specific to Claude Code

- **Never touch `main`.** Do not commit, push, merge, rebase, or open PRs that target `main` (except release PRs `dev → main`, which only organizers create and merge). Every change goes on a branch created from `dev` (`feat/…`, `fix/…`, `chore/…`) and its PR targets `dev`. Before starting: `git checkout dev && git pull` and `npm run db:migrate`.
- How to run the project locally (DB + both apps): see "Levantar el proyecto en local" in `AGENTS.md`.
- `AGENTS.md` and `CONTEXT.md` above are the source of truth for stack, architecture, conventions, and commands — read them, don't duplicate them here.
- `README.md` covers local setup (Supabase local + `npm run db:*` scripts); `docs/entornos-supabase.md` covers the local and prod environments, the migration flow, and backups.
- CI only covers the database: `.github/workflows/db-ci.yml` replays all migrations + seed on PRs touching `supabase/**`; `db-deploy-prod.yml` applies migrations on merge to `main` after manual approval. There is no shared dev/staging project: only local and prod. Nothing enforces lint/test/build, so run `npm run lint` and the relevant test/build command yourself before considering a task done.
- Deploys: Vercel publishes each app when a release PR `dev → main` is merged (previews for PRs and for `dev`, all backed by the prod DB). Migrations ship from the same merge but wait for approval: in a release, back-office goes first (approve the DB right away) and eventos after; removals of DB objects ship one release after the code that stops using them.
- Never point `environment.ts` at production or change the prod schema directly (SQL Editor, Supabase MCP writes, local `db push`). Use the local stack (`npm run db:start`); see `docs/entornos-supabase.md`.
- Additional skills live in `.claude/skills/` (ported from this repo's `.opencode/skills/`): `project-architecture`, `design-system`, `database`, `backoffice-features`, and `/create-crud` for scaffolding a new admin CRUD feature.
