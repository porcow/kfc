## Why

The project already has a full uninstall path in `uninstall.sh`, but the primary local admin interface `kfc` does not expose an equivalent top-level command. Adding `kfc uninstall` makes full removal available through the same CLI operators already use, while an explicit confirmation step reduces the risk of accidental destructive cleanup.

## What Changes

- Add a top-level `kfc uninstall` command that performs the same complete user-local removal as `uninstall.sh`.
- Require an interactive confirmation prompt before destructive uninstall proceeds, unless an explicit non-interactive override is supplied.
- Introduce `kfc uninstall --yes` as the non-interactive equivalent so shell installers can reuse the same core uninstall behavior.
- Keep `kfc service uninstall` scoped to launchd-managed service and cronjob teardown only; it does not remove app files, config, or working data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: extend the `kfc` local CLI contract with a full uninstall command, interactive confirmation behavior, and a non-interactive override for scripted use

## Impact

- Affected code: `src/kfc.ts`, `uninstall.sh`, CLI tests, and uninstall documentation
- APIs: local CLI gains `kfc uninstall` and `kfc uninstall --yes`
- Systems: user-local uninstall flow is centralized in the `kfc` CLI rather than split between shell and TypeScript implementations
