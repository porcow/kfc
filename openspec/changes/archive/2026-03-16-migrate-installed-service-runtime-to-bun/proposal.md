## Why

The repository already uses Bun for dependency installation, repository-local start/dev, and the default test runner. The remaining Node-first boundary is the installed service lifecycle:

- `install.sh` still writes a launcher that execs Node
- the managed launchd service still invokes `node --experimental-strip-types`
- cronjob launchd plists still invoke Node
- update / rollback refresh the installed service under Node assumptions

That split is now artificial. The project intends to make Bun the formal runtime for installed service execution as well, so the host lifecycle matches the repository-local runtime and the remaining Node compatibility code can be retired in follow-up cleanup.

## What Changes

- Migrate the installed `kfc` launcher from Node runtime invocation to Bun runtime invocation.
- Migrate the main launchd-managed service plist from Node runtime invocation to Bun runtime invocation.
- Migrate cronjob launchd plist program arguments from Node runtime invocation to Bun runtime invocation.
- Ensure `install.sh`, release-based update, and rollback continue to refresh the managed service successfully under Bun runtime.
- Update docs and manual verification guidance so the installed service is described as Bun-based rather than Node-based.

## Impact

- Installed hosts will require Bun not just for dependency installation, but also for runtime execution.
- The project will align repository-local runtime and installed-service runtime on Bun.
- This change creates the precondition for a later cleanup change that removes Node runtime compatibility from sqlite/test/runtime shims.
