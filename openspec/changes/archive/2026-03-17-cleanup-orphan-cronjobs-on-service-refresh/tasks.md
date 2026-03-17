## 1. Service refresh cleanup

- [x] 1.1 Extend the service-install path to discover cron cleanup targets from both the previously installed config and the newly requested config
- [x] 1.2 Remove old-only cron launchd jobs and plist files before bootstrapping the refreshed main service while keeping current-config cron jobs for normal reconcile

## 2. Shared update and rollback behavior

- [x] 2.1 Verify that `kfc update` and `kfc rollback` inherit the strengthened install semantics without adding a second cleanup path
- [x] 2.2 Preserve `kfc service stop` as a process-only operation with no launchd configuration teardown

## 3. Verification and documentation

- [x] 3.1 Add or update lifecycle tests covering orphan cron cleanup during `service install` and the shared refresh path used by update/rollback
- [x] 3.2 Update README and related service lifecycle documentation to clarify refresh-time cron convergence and unchanged `service stop` semantics
