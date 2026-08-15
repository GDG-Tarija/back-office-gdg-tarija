# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@CONTEXT.md

## Notes specific to Claude Code

- `AGENTS.md` and `CONTEXT.md` above are the source of truth for stack, architecture, conventions, and commands — read them, don't duplicate them here.
- `README.md` is a stale placeholder; ignore it.
- There is no CI pipeline (`.github/workflows` doesn't exist) — nothing enforces lint/test/build on PRs, so run `npm run lint` and the relevant test/build command yourself before considering a task done.
- Additional skills live in `.claude/skills/` (ported from this repo's `.opencode/skills/`): `project-architecture`, `design-system`, `database`, `backoffice-features`, and `/create-crud` for scaffolding a new admin CRUD feature.
