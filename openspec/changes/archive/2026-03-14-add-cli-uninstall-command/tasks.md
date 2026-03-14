## 1. CLI uninstall flow

- [x] 1.1 Add a top-level `kfc uninstall` command separate from `kfc service uninstall`
- [x] 1.2 Implement interactive confirmation so only `y` or `yes` proceeds with full uninstall
- [x] 1.3 Add `kfc uninstall --yes` as the non-interactive equivalent

## 2. Shared uninstall behavior

- [x] 2.1 Move full user-local uninstall behavior into the CLI so it removes launchd state, installed app files, launcher, default config, and work directory
- [x] 2.2 Keep `kfc service uninstall` scoped to service and cron launchd teardown only
- [x] 2.3 Update `uninstall.sh` to delegate to `kfc uninstall --yes` when the installed launcher is available while keeping a fallback path for broken or missing launchers

## 3. Verification and docs

- [x] 3.1 Add tests for confirmed uninstall, cancelled uninstall, and `--yes` non-interactive uninstall
- [x] 3.2 Update README and manual verification docs to distinguish `kfc uninstall` from `kfc service uninstall`
