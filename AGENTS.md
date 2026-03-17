# Repository Guidelines

## Project Structure & Module Organization

Core application code lives in `src/`. Key areas include `src/config/` for TOML loading and path defaults, `src/http/` for the shared server, `src/feishu/` for Feishu integration, `src/persistence/` for SQLite-backed storage, and `src/tools/` for built-in task implementations. The main service entrypoint is `src/index.ts`; the local admin CLI is `src/kfc.ts` and the `./kfc` wrapper script. Example config lives in `config/example.bot.toml`. Operational samples and fixtures are under `data/`, and manual end-to-end checks live in `docs/manual-verification.md`.

## Build, Test, and Development Commands

- `bun run dev`: starts the service in watch mode through Bun.
- `bun run start`: runs the TypeScript entrypoint once through Bun.
- `bun test`: runs the Bun test suite against `src/*.test.ts` and `src/**/*.test.ts`.
- `./kfc health`: queries the local service health endpoint.
- `./kfc service install --config /path/to/bot.toml`: installs and starts the managed macOS `launchd` service.

Use `KIDS_ALFRED_CONFIG=/path/to/bot.toml bun run dev` for local bot development against a non-default config.

## Coding Style & Naming Conventions

Follow the existing TypeScript ESM style: explicit `.ts` import suffixes, single quotes, semicolons, trailing commas where multiline, and 2-space indentation. Keep modules focused and place domain-specific code in the matching subdirectory. Use `camelCase` for functions and variables, `PascalCase` for types/classes, and kebab-case task IDs such as `check-pd-win11`. Match the existing colocated test naming pattern: `feature.test.ts` beside the implementation.

## Testing Guidelines

Tests use Bun's built-in test runner via `bun test`; no separate test framework is configured. Add or update focused unit tests whenever behavior changes, especially for config parsing, CLI flows, cron handling, and Feishu message paths. Prefer small deterministic tests in `src/**/*.test.ts`, then use `docs/manual-verification.md` for host-level or Feishu integration checks.

## Commit & Pull Request Guidelines

Recent history favors short imperative subjects, often Conventional Commit style such as `feat: add health and uninstall workflows`. Prefer `feat:`, `fix:`, or similarly scoped prefixes for user-visible changes. Keep PRs narrow, describe behavior changes, list verification steps (`npm test`, manual checks), and include screenshots or sample command output when updating Feishu cards, CLI UX, or service-management flows.

## Security & Configuration Notes

Do not commit real Feishu credentials or local bot configs. Start from `config/example.bot.toml`, keep secrets in machine-local config files, and treat SQLite files under bot working directories as local runtime state rather than fixtures.
