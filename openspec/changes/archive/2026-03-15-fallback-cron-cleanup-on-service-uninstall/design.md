## Context

The current uninstall path relies on the installed main-service plist to locate `KIDS_ALFRED_CONFIG`, load configured bots, and derive the launchd cronjob plist paths to unload. This works when the service plist is still present and readable, but fails to clean bot-scoped cronjobs when the main-service plist has already been removed or is corrupted. The host uninstall script already has a filesystem fallback that scans `~/.kfc/**/launchd/*.plist`; `kfc service uninstall` should converge on the same final-state guarantee.

## Goals / Non-Goals

**Goals:**
- Ensure `kfc service uninstall` removes launchd-managed cronjobs even if the main-service plist is missing or unreadable.
- Reuse the config-derived cleanup path when available, because it provides precise bot/task labels and better diagnostics.
- Add a deterministic fallback scan of `~/.kfc/**/launchd/*.plist` when config-derived cleanup is unavailable or incomplete.
- Preserve the existing “continue across multiple cronjobs and report aggregated cleanup issues” semantics.

**Non-Goals:**
- Changing cronjob install locations outside the existing `~/.kfc/**/launchd/` tree.
- Introducing a new persistence index for installed cronjobs.
- Cleaning unrelated third-party launchd jobs or arbitrary plist files outside the KFC launchd naming pattern.

## Decisions

### Prefer config-derived cleanup first, then fallback scan

`kfc service uninstall` will continue to use the installed main-service plist as the primary source of truth when that path is available. This keeps the current precise behavior for healthy installs. If the plist is missing, unreadable, lacks `KIDS_ALFRED_CONFIG`, or loading the referenced config fails, uninstall will continue into a fallback filesystem scan instead of returning early.

Alternative considered: always scan `~/.kfc/**/launchd/*.plist` and ignore config-derived cleanup. Rejected because config-derived cleanup gives better diagnostics and avoids treating the filesystem layout as the only source of truth.

### Fallback scan targets only KFC cronjob plists under the work tree

The fallback path will recursively scan `~/.kfc/**/launchd/*.plist`, filter to KFC cronjob labels or filenames, then attempt `launchctl bootout gui/<uid> <plist>` followed by plist deletion for each target. This mirrors the host uninstall script and avoids depending on the main-service plist.

Alternative considered: scan all launchd plists under the user home. Rejected because it risks touching unrelated launch agents.

### Deduplicate targets before cleanup

If config-derived cleanup and filesystem-scan fallback both identify the same cronjob plist, the cleanup layer will deduplicate by plist path so the uninstall report remains stable and each cronjob is processed at most once.

Alternative considered: allow duplicate cleanup attempts and ignore extra errors. Rejected because it produces noisy operator-facing errors and makes partial cleanup harder to reason about.

### Surface fallback usage in uninstall diagnostics

When uninstall has to fall back to filesystem scanning, the operator-facing result should still explain cleanup issues clearly. The implementation will aggregate cleanup errors as it does today, but distinguish “could not derive targets from installed config” from “failed to unload/remove a discovered cronjob plist.”

Alternative considered: silently fall back with no diagnostic distinction. Rejected because partial uninstall states are exactly the cases that need more visibility, not less.

## Risks / Trade-offs

- [Filesystem scan may find stale plist files for jobs no longer loaded] -> Treat `bootout` failures as per-target cleanup errors and continue removing the plist file.
- [Fallback cleanup depends on the conventional `~/.kfc/**/launchd/` layout] -> Limit fallback scope to the documented work directory structure and keep config-derived cleanup as the preferred path.
- [A corrupted or partially removed install may produce both config resolution errors and per-target cleanup errors] -> Aggregate both classes of errors into a single operator-facing uninstall result.

## Migration Plan

No data migration is required. After deployment:
- Healthy installs continue to uninstall via config-derived cleanup.
- Partial installs where the main-service plist is already absent will now still unload and delete cronjob plists discovered under `~/.kfc/**/launchd/`.

Rollback is straightforward: revert the fallback scan behavior. The only operational change is improved cleanup coverage during uninstall.

## Open Questions

None.
