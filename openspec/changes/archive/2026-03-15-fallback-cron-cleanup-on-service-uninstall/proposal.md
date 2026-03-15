## Why

`kfc service uninstall` currently derives cron cleanup targets from the installed main-service plist. If that plist has already been removed or is unreadable, launchd-managed bot cronjobs can remain loaded even though the main service uninstall appears to have succeeded. This leaves orphaned launchd jobs behind and makes uninstall behavior depend on cleanup order rather than final system state.

## What Changes

- Modify `kfc service uninstall` so it still cleans up launchd-managed cronjobs when the main-service plist is missing or cannot provide `KIDS_ALFRED_CONFIG`.
- Add a fallback uninstall path that scans `~/.kfc/**/launchd/*.plist`, attempts `launchctl bootout` for each matching cron plist, and removes those plist files.
- Require uninstall reporting to distinguish config-derived cleanup from filesystem-scan fallback cleanup, while continuing across multiple cronjobs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: `kfc service uninstall` fallback behavior changes so cronjob launchd cleanup still occurs when the installed main-service plist is missing or unusable.

## Impact

- Affected code: [service-manager.ts](/Users/porco/Projects/KidsAlfred/src/service-manager.ts), [kfc.ts](/Users/porco/Projects/KidsAlfred/src/kfc.ts), [uninstall.sh](/Users/porco/Projects/KidsAlfred/uninstall.sh), and related tests.
- Affected systems: macOS `launchd`, user-local cron plist files under `~/.kfc/**/launchd/`.
- Operator impact: `kfc service uninstall` becomes more reliable for partial or previously damaged installations.
