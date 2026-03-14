## Why

`kfc service uninstall` currently guarantees removal of the main service launchd entry, but it does not explicitly unload every bot-scoped cronjob launchd registration. That leaves uninstall behavior weaker than operators expect and risks stale cron jobs surviving after the main service is removed.

## What Changes

- Require `kfc service uninstall` to enumerate and unload all configured cronjob launchd jobs before removing the main service plist.
- Require uninstall flows to remove cronjob plist files after successful or best-effort unload.
- Clarify uninstall semantics so “service uninstall” means removing both the main service and all bot cronjob launchd registrations for the installed config.
- Keep best-effort cleanup behavior operator-safe: cronjob unload failures should be surfaced clearly rather than silently ignored.

## Capabilities

### New Capabilities

### Modified Capabilities
- `local-task-execution-audit`: change uninstall requirements so `kfc service uninstall` cleans up all cronjob launchd registrations and plist files in addition to the main service

## Impact

- Affected code: `src/kfc.ts`, cron/launchd cleanup helpers, uninstall script fallback behavior, and related tests
- Affected systems: macOS launchd state for the main service and all bot cronjobs
