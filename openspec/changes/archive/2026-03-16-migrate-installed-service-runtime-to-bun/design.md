## Context

The codebase has already crossed most of the Bun migration boundary:

- `bun install` is the supported package-manager path
- repository-local `start`, `dev`, and `test` run through Bun
- sqlite and tests have compatibility layers so Bun can execute the repository suite

But installed execution still looks like this:

```text
install.sh
  -> writes ~/.local/bin/kfc launcher
     -> exec node --experimental-strip-types src/kfc.ts

kfc service install
  -> writes launchd plist
     -> ProgramArguments = [node, --experimental-strip-types, src/index.ts]

cron launchd jobs
  -> ProgramArguments = [node, --experimental-strip-types, src/kfc.ts exec ...]
```

That leaves Node as a production runtime prerequisite even though the rest of the project has moved to Bun.

## Goals / Non-Goals

### Goals

- Make the installed `kfc` launcher invoke Bun rather than Node.
- Make the managed launchd main service invoke Bun rather than Node.
- Make launchd-managed cronjobs invoke Bun rather than Node.
- Keep the existing `kfc service install`, update, rollback, and uninstall semantics intact while changing only the installed runtime.
- Ensure the host installation flow leaves the operator with a working Bun runtime path for all installed-service entrypoints.

### Non-Goals

- Removing all remaining Node compatibility code in the same change.
- Rewriting application logic to Bun-only APIs outside the installed runtime boundary.
- Changing the user-facing command model for update, rollback, health, or cron management.
- Migrating release artifact format away from the current tarball/install-metadata model.

## Decisions

### Installed launcher switches from Node to Bun

The installed `~/.local/bin/kfc` wrapper will execute Bun directly against `src/kfc.ts`.

Target shape:

```text
exec bun "${APP_DIR}/src/kfc.ts" "$@"
```

Rationale:
- aligns the operator-facing installed CLI with repository-local Bun execution
- removes Node as a runtime prerequisite for installed CLI workflows

### Main launchd service switches from Node to Bun

The generated `com.kidsalfred.service.plist` will invoke Bun directly against `src/index.ts`.

Target shape:

```text
ProgramArguments = [
  <bun executable>,
  <app>/src/index.ts
]
```

The service manager should stop encoding Node-specific flags like `--experimental-strip-types`.

### Cron launchd jobs switch from Node to Bun

Cronjob plists will invoke Bun directly against `src/kfc.ts exec ...`.

Target shape:

```text
ProgramArguments = [
  <bun executable>,
  <app>/src/kfc.ts,
  exec,
  --bot,
  ...,
  --task,
  ...
]
```

This keeps the task entry contract unchanged while making the runtime consistent.

### Installed runtime path is resolved explicitly

Installed-service runtime should not depend on ambient shell PATH more than necessary. The launcher/plist generation should resolve and persist the Bun executable path used for installation/runtime.

Expected behavior:
- installation discovers Bun executable path once
- generated launcher/plists use that explicit Bun path

This avoids launchd PATH ambiguity.

### Update and rollback continue to refresh service through install semantics

Release-based update and rollback already refresh the service by re-running service-install semantics. That contract remains unchanged; only the written runtime program arguments change from Node to Bun.

### Repository-local and installed runtime become aligned, but cleanup stays separate

After this change:

```text
repository-local runtime  -> Bun
installed service runtime -> Bun
test runner              -> Bun
```

But Node compatibility cleanup stays out of scope until this Bun installed-runtime path is proven stable.

## Risks / Trade-offs

- [Bun path resolution may differ between interactive shell and launchd] -> Persist the explicit Bun executable path into generated launcher/plists.
- [Existing hosts may have old Node-based plists/wrappers] -> `kfc service install` and release-based update must rewrite them into Bun-based forms.
- [Builtin task subprocess assumptions may still reference Node] -> verify cron and installed CLI flows under Bun-based launchd paths.
- [Operators may assume Node is still required for installed execution] -> update docs to state Bun is now required for both install and runtime execution.

## Migration Plan

1. Introduce or reuse a single installed-runtime path resolver for Bun.
2. Update generated launcher content in `install.sh`.
3. Update main-service plist generation to use Bun.
4. Update cron plist generation to use Bun.
5. Update tests that assert Node program arguments or Node launcher content.
6. Verify:
   - install script output
   - service install plist content
   - cron plist content
   - update / rollback still refresh service successfully
7. Update docs and manual verification.

## Rollback Strategy

If Bun-based installed runtime proves unstable:

- restore launcher generation to Node
- restore main-service plist generation to Node
- restore cron plist generation to Node
- keep Bun as package manager and repository-local runtime

This rollback is bounded to installed-runtime generation logic and does not require reverting the earlier Bun package-manager/test changes.
