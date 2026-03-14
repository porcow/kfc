## Context

The current uninstall path is split across two layers: `kfc service uninstall` removes only the main service launchd entry, while `uninstall.sh` deletes local files such as `~/.kfc`. Cronjob launchd plists live separately under each bot's working data tree and are bootstrapped under bot-scoped labels, so deleting files alone is weaker than explicitly unloading those launchd registrations.

## Goals / Non-Goals

**Goals:**
- Make `kfc service uninstall` remove the main service and all configured cronjob launchd registrations for the installed config.
- Ensure cronjob plist files are removed as part of uninstall rather than left as stale artifacts.
- Keep uninstall best-effort and operator-visible: cronjob cleanup failures should not be silently hidden.

**Non-Goals:**
- Changing `/cron start` or `/cron stop` semantics during normal service operation.
- Introducing a new persistent inventory of cronjobs beyond the installed config and existing bot task definitions.
- Cleaning arbitrary unrelated launchd jobs outside the installed `kfc` service config.

## Decisions

### Read the installed config and enumerate cronjob tasks during uninstall
`kfc service uninstall` will load the installed config, derive every bot-scoped cronjob label and plist path, and explicitly boot them out before removing the main service plist. This keeps uninstall behavior aligned with how cronjobs are created today.

Alternative considered:
- Delete `~/.kfc` and rely on file removal alone. Rejected because launchd registrations can outlive the plist file on disk.

### Scope cleanup to cronjobs declared in the installed config
Uninstall will clean only the cronjob launchd jobs derivable from the config path the service is using. This avoids broad launchd sweeps and keeps cleanup deterministic.

Alternative considered:
- Enumerate all `com.kidsalfred.*` jobs from launchctl and remove them opportunistically. Rejected because it risks touching jobs outside the installed config scope.

### Treat cronjob cleanup as best-effort but surfaced
If one cronjob fails to unload, uninstall should report that failure clearly while continuing cleanup for the remaining jobs. Operators need to know the system is not fully clean, but one bad cronjob should not prevent attempts to remove the rest.

Alternative considered:
- Fail on the first cronjob unload error. Rejected because it would leave the system in a more partial state than necessary.

## Risks / Trade-offs

- [Installed config is missing or unreadable during uninstall] → Still remove the main service plist and report that cronjob-specific cleanup could not be fully resolved from config.
- [Config no longer matches the exact cronjobs previously installed] → Clean what can be derived from the current config and document that manual launchctl cleanup may still be required for orphaned jobs.
- [Best-effort cleanup may leave partial cron residue] → Surface per-cronjob unload failures in operator-facing output so the residual state is explicit.
