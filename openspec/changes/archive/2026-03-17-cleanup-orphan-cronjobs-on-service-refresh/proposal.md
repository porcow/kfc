## Why

`kfc update` and `kfc service install` currently refresh the main launchd-managed service and then let the new process reconcile configured cronjobs, but they do not clean up cron launchd jobs that were present under the previously installed config and have since been removed. That leaves orphan launchd jobs behind after a successful refresh, which is inconsistent with the expectation that install/update should converge the host to the currently configured service state.

## What Changes

- Make service refresh/install remove cron launchd jobs that belong to the previously installed config but are no longer present in the newly installed config.
- Keep `kfc update` and rollback using the same service-install refresh semantics, now including cron orphan cleanup during convergence.
- Preserve `kfc service stop` semantics: it stops the main service process only and does not uninstall or delete launchd configuration.
- Update local lifecycle specs and operator documentation to distinguish refresh-time cron convergence from explicit uninstall behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: Tighten service refresh/install requirements so successful install/update convergence removes cron launchd jobs deleted from config, while `kfc service stop` remains a process stop only.

## Impact

- Affected code: `src/service-manager.ts`, `src/update.ts`, and related lifecycle tests.
- Affected docs/specs: `openspec/specs/local-task-execution-audit/spec.md`, `README.md`, and service lifecycle verification docs.
- No new external dependencies.
