## Context

The current service refresh path is split across two layers. `LaunchdServiceManager.install()` refreshes only the main service launchd plist and process, while cronjobs are converged later by the newly started service during runtime reconciliation. That runtime reconciliation only iterates tasks present in the current config, so cron launchd jobs that were installed under an older config and have since been removed are left behind as orphans.

The desired behavior is stronger host convergence for install/update/rollback refreshes: after a successful refresh, launchd state should reflect the current config, not a union of current tasks and stale deleted tasks. At the same time, `kfc service stop` already has a deliberately narrower meaning and should remain a process stop only.

## Goals / Non-Goals

**Goals:**
- Make `kfc service install` clean up cron launchd jobs that belong to the previously installed config but are absent from the newly installed config.
- Ensure `kfc update` and `kfc rollback` inherit that same cleanup because they already reuse service-install semantics.
- Preserve the current meaning of `kfc service stop`: stop the main service process without uninstalling launchd configuration.
- Keep cron convergence deterministic and scoped to KFC-managed jobs derived from known config paths.

**Non-Goals:**
- Do not turn `kfc service stop` into an uninstall or partial cleanup command.
- Do not broaden cleanup to arbitrary unrelated launchd jobs on the host.
- Do not redesign cron desired-state semantics or chat subscription persistence.
- Do not require a separate manual cleanup command for the normal refresh path.

## Decisions

### 1. Refresh/install performs a config diff between old and new cron targets

Before replacing the installed main service plist, the install path should resolve:
- cron targets derivable from the currently installed config path, if any
- cron targets derivable from the newly requested config path

It then removes only the cron targets present in the old set but absent from the new set.

This keeps cleanup bounded to KFC-managed cronjobs and avoids broad filesystem or launchd sweeps.

Alternative considered:
- Rely only on new-process reconcile. Rejected because reconcile cannot see deleted tasks from the old config and therefore cannot remove their launchd registrations.

### 2. Deleted cron targets are removed before the refreshed main service starts

Orphan cleanup should happen in the service-install path before bootstrap/kickstart of the new main service. That ensures the host does not briefly run a refreshed main service alongside cron jobs that should already be gone.

Alternative considered:
- Start the new main service first and let it clean up after boot. Rejected because the cleanup logic currently lives outside the runtime and this ordering would still allow a stale window.

### 3. Cleanup reuses the existing cron-target discovery and launchd cleanup helpers

The repo already has:
- `readInstalledServiceConfigPath()`
- `listCronCleanupTargets()`
- `cleanupCronLaunchdJobs()`

The refresh path should reuse those building blocks rather than inventing another cleanup mechanism.

Alternative considered:
- Scan the whole `~/.kfc/**/launchd/*.plist` tree during every install. Rejected as too broad for routine refresh and more likely to affect stale artifacts outside the active installed-config boundary.

### 4. `kfc service stop` remains process-only

The change will not modify `stop()`. Specs and docs should state clearly that:
- `service stop` stops the main service process
- it keeps both the main-service plist and cron launchd plists on disk
- the next start/install/update/rollback may reapply cron policy

Alternative considered:
- Extend `service stop` to also unload cronjobs. Rejected because it would blur the established boundary between process lifecycle and launchd configuration teardown.

## Risks / Trade-offs

- [Installed service plist exists but its config path can no longer be read] → Fall back to “no old cron targets discovered” and continue the main refresh, while keeping uninstall-style broader cleanup out of scope for install.
- [A cron task is renamed between configs] → Treat it as one deleted target plus one new target, which produces the desired unload-then-reconcile behavior.
- [Cleanup failure blocks a legitimate main-service refresh] → Surface an explicit operator-facing error instead of silently leaving stale cron jobs behind.
- [Runtime reconcile still restarts `auto_start=true` jobs on startup] → Accept this, because the change is about cleaning deleted jobs, not changing desired-state enforcement for retained jobs.

## Migration Plan

1. Extend the service-install path to discover old vs new cron cleanup targets.
2. Remove the old-only targets before bootstrapping the refreshed main service.
3. Keep runtime reconcile unchanged for cron tasks still present in config.
4. Update tests, specs, and README to reflect the stronger refresh convergence and the unchanged `service stop` semantics.

Rollback strategy:
- Revert the service-install cleanup change to return to the previous refresh behavior.
- No persistent data migration is required.

## Open Questions

None. The current behavior gap and desired boundary are clear enough to implement directly.
