## 1. Uninstall Target Discovery

- [x] 1.1 Extend `kfc service uninstall` target discovery so it no longer returns early when the main-service plist is missing or unreadable.
- [x] 1.2 Add a fallback scanner for `~/.kfc/**/launchd/*.plist` that identifies KFC-managed cronjob plist paths and launchd labels.
- [x] 1.3 Deduplicate cron cleanup targets collected from config-derived discovery and fallback filesystem scanning.

## 2. Cleanup Execution

- [x] 2.1 Reuse the existing cron cleanup loop for fallback-discovered plist targets, including `launchctl bootout` and plist deletion.
- [x] 2.2 Preserve aggregate error reporting so uninstall continues across multiple cronjobs even when some fallback targets fail.
- [x] 2.3 Keep main-service plist removal and main-service bootout semantics unchanged after cron cleanup completes.

## 3. Verification

- [x] 3.1 Add unit tests for `kfc service uninstall` when the main-service plist is missing but fallback cron plists exist.
- [x] 3.2 Add unit tests for unreadable or unusable installed config paths that still fall back to filesystem scan cleanup.
- [x] 3.3 Update manual verification guidance for reproducing uninstall with orphaned cronjob plists under `~/.kfc/**/launchd/`.
