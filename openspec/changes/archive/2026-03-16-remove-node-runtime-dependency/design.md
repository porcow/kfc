## Context

The codebase has already moved most execution paths to Bun:

```text
bun install   -> supported package manager
bun start/dev -> supported repository-local runtime
bun test      -> supported repository test runner
launchd       -> Bun-based installed runtime
```

The remaining Node dependence is now incidental rather than architectural:

```text
install.sh
  -> shell
  -> node inline scripts for JSON parsing / metadata write

./kfc
  -> node --experimental-strip-types shebang

sqlite adapter
  -> Bun backend + node:sqlite fallback

test shim
  -> bun:test + node:test fallback
```

This change removes those leftovers and makes Bun the only supported runtime.

## Goals / Non-Goals

### Goals

- Remove the Node requirement from installation and lifecycle flows.
- Make the repository-local `./kfc` wrapper Bun-based.
- Make sqlite persistence Bun-only.
- Make the test runner Bun-only.
- Explicitly validate that the Feishu SDK usage surface remains functional under Bun.

### Non-Goals

- Replacing `@larksuiteoapi/node-sdk` unless Bun compatibility validation proves it necessary.
- Changing user-facing command semantics for update, rollback, health, cron, or task execution.
- Altering the release artifact model or install-metadata schema.

## Decisions

### `install.sh` becomes Bun-only

`install.sh` will no longer require or invoke Node.

Node is currently used only for:
- parsing the GitHub Release API payload
- writing `install-metadata.json`

Both responsibilities will move to Bun.

Target shape:

```text
require bun
curl release API JSON
bun eval / bun inline script parses release metadata
...
bun inline script writes install metadata
```

This makes install/update lifecycle consistent with the rest of the Bun migration.

### Repository-local `./kfc` becomes Bun-based

The root `kfc` wrapper will stop using:

```text
#!/usr/bin/env -S node --experimental-strip-types
```

and will instead execute through Bun.

This change is intentionally limited to the repository-local wrapper. The installed launcher already executes Bun.

### SQLite adapter becomes Bun-only

`src/persistence/sqlite.ts` currently selects between:

```text
Bun  -> bun:sqlite
Node -> node:sqlite
```

After this change:

```text
Bun -> bun:sqlite only
```

Rationale:
- installed runtime is already Bun-based
- repository-local supported runtime is already Bun-based
- retaining `node:sqlite` now only preserves an unsupported runtime path

### Test compatibility shim becomes Bun-only or disappears

`src/test-compat.ts` currently provides:

```text
Bun  -> bun:test
Node -> node:test
```

After this change, Node test runner support is no longer promised. The shim may either:

- be simplified to Bun-only, or
- disappear entirely if direct `bun:test` imports are cleaner

The key contract is:

```text
direct bun test = supported
node --test     = no longer supported
```

### Feishu SDK validation gates Node removal

The project does not need to replace `@larksuiteoapi/node-sdk` solely because of its package name. Instead, Node runtime removal is gated on Bun compatibility of the actual usage surface:

- WebSocket event client initialization
- card action callback handling
- text/card replies
- image upload and send
- service-event notifications

If those paths remain functional under Bun, the SDK may remain in place.

## Risks / Trade-offs

- [Install script portability] -> Bun must already be installed or bootstrap successfully before any JSON handling step that previously used Node.
- [Root wrapper portability] -> repository users must have Bun on PATH when invoking `./kfc`.
- [SQLite cleanup removes fallback tooling] -> any undocumented Node-based local workflows will stop working; this is acceptable because Node runtime support is intentionally dropped.
- [Feishu SDK may hide Node-only assumptions] -> explicit validation must cover the critical behaviors we actually use.

## Migration Plan

1. Replace Node inline scripts in `install.sh` with Bun-based equivalents.
2. Change repository-local `./kfc` to a Bun shebang/launcher.
3. Remove the `node:sqlite` branch and ensure all runtime paths still open sqlite under Bun.
4. Remove the Node test fallback and keep Bun as the single test runner.
5. Update docs to remove Node runtime claims.
6. Run repository tests with Bun and perform focused Feishu/runtime verification.

## Verification Focus

Minimum validation for this change:

- `bun test` passes
- `install.sh` no longer requires Node
- repository-local `./kfc` runs through Bun
- sqlite-backed tests and service startup still pass under Bun
- Feishu SDK-dependent tests still pass under Bun

## Rollback Strategy

If Bun-only runtime proves incomplete:

- restore Node usage in `install.sh`
- restore the Node shebang in `./kfc`
- restore `node:sqlite` fallback
- restore `node:test` fallback

This rollback is localized to runtime compatibility cleanup and does not require reverting the broader Bun migration.
