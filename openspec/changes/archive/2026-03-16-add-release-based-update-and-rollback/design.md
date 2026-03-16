## Context

The host installer downloads a GitHub branch tarball, extracts it into `~/.local/share/kfc/app`, installs runtime dependencies, and then delegates to `kfc service install`. The current self-update design instead assumes the running app directory is a git checkout and blocks unless `git rev-parse --is-inside-work-tree` succeeds. That mismatch means the normal install path cannot use the update feature it ships with.

The new design needs to align install, update, and rollback around the same deployment artifact. The user has chosen a GitHub Release tarball model with these boundaries:
- update compares the installed release version to the latest available release
- rollback always targets the single previous locally installed version
- successful update always overwrites `app.previous`
- rollback swaps `app` and `app.previous`, so the rolled-back-from version remains available as the next rollback candidate

## Goals / Non-Goals

**Goals:**
- Make the supported install path and supported update path use the same GitHub Release artifact model.
- Add a local install metadata record that lets CLI and Feishu flows inspect current and previous installed versions without relying on git.
- Support staged update via `app.new`, active app via `app`, and local rollback via `app.previous`.
- Add `kfc rollback` and `/run rollback` with the same confirmation and operator-facing result style as update.
- Keep bots in control of Feishu exposure by requiring explicit protected task configuration for `update` and `rollback`.

**Non-Goals:**
- Supporting rollback to arbitrary older releases beyond the immediately previous local install.
- Supporting prerelease channels, multiple release streams, or user-selectable versions in v1.
- Preserving git-based self-update for packaged installs.
- Introducing platform support beyond the existing macOS-focused lifecycle.

## Decisions

### GitHub Release tarballs become the canonical install/update artifact

Install and update will both use a GitHub Release asset rather than a git checkout or branch tarball. This makes deployed state deterministic and aligned with the installation workflow.

Alternative considered: switching `install.sh` to `git clone`. Rejected because it turns normal user installs into mutable source checkouts and keeps update semantics coupled to git internals instead of to the shipped artifact.

### Persist install metadata outside the app directory

The system will persist release install metadata in a stable user-local location outside `app`, so replacing `app` does not erase version history or source metadata. The metadata will record at least:
- install source
- repo
- release channel or track
- current version
- previous version
- installation timestamps

The metadata file will live beside the installed app tree, for example at `~/.local/share/kfc/install-metadata.json`.

The v1 `install-metadata.json` shape is:

```json
{
  "install_source": "github-release",
  "repo": "porcow/kfc",
  "channel": "stable",
  "current_version": "v0.2.0",
  "previous_version": "v0.1.9",
  "installed_at": "2026-03-16T01:00:00Z",
  "previous_installed_at": "2026-03-10T09:00:00Z"
}
```

On first install, `previous_version` and `previous_installed_at` may be `null`.

Alternative considered: derive version from files inside `app` on every run. Rejected because update and rollback need a stable source of truth even while staging or swapping directories.

### Install metadata is generated from release metadata embedded in the release asset

Each GitHub Release tarball will include an embedded release metadata file, such as `.kfc-release.json`, that declares the packaged artifact identity. The install flow will read that embedded metadata after extraction and use it to create or rewrite the external install metadata file.

The v1 `.kfc-release.json` shape is:

```json
{
  "repo": "porcow/kfc",
  "version": "v0.2.0",
  "channel": "stable",
  "published_at": "2026-03-16T00:00:00Z",
  "asset_name": "kfc-v0.2.0.tar.gz"
}
```

This same embedded release metadata is the source of truth for:
- first install creating `install-metadata.json`
- update rewriting `current_version` and `previous_version`
- rollback verifying and swapping the locally installed versions

Alternative considered: infer the version only from the asset filename or query GitHub again after extraction. Rejected because embedded release metadata makes the installed artifact self-describing and avoids relying on filename conventions as the sole version source.

### Update stages into `app.new` and then swaps directories

Release update will:
1. query GitHub Release metadata
2. confirm that the current install is not already on the latest supported stable release
3. download the selected release asset
4. extract to `app.new`
5. run `npm install --omit=dev`
6. verify required runtime entrypoints
7. move `app` to `app.previous`
8. move `app.new` to `app`
9. run `kfc service install` semantics
10. update install metadata

Only the latest stable GitHub Release is eligible for v1 updates. Draft and prerelease releases are excluded from update inspection and selection.

Alternative considered: downloading the tarball first just to determine whether an update exists. Rejected because GitHub Release metadata is sufficient for lightweight remote version inspection, and the embedded release metadata is better used as a second-stage verification after download.

### Rollback swaps `app` and `app.previous`

Rollback will not fetch from the network. It will require a locally available `app.previous` and matching previous-version metadata, then swap the active and previous directories and refresh the managed service.

Alternative considered: rollback by redownloading an older release asset. Rejected for v1 because local rollback is faster, simpler, and matches the user-requested boundary of “the previous locally installed version.”

### Update and rollback failures must preserve a recoverable deployment state

The lifecycle manager will use fixed directory names:
- `app` for the active version
- `app.new` for a staged update candidate
- `app.previous` for the single rollback candidate

Failure handling is explicit:
- If update fails before directory swap, leave `app` unchanged.
- If update fails after swap and automatic restore succeeds, report the update failure and the restored previous version.
- If update fails after swap and automatic restore fails, report that manual recovery is required.
- If rollback fails after directory swap begins, attempt to swap back automatically and restore install metadata to the last known runnable state.

Alternative considered: keeping additional fallback directories beyond `app.previous`. Rejected for v1 because a single rollback target keeps lifecycle semantics simple and predictable.

### Operator-facing update state changes from git semantics to release semantics

The supported states become:
- already latest
- update available
- update blocked (missing metadata, missing asset, download failure, install failure, verification failure)

Git-specific states such as dirty worktree, ahead, or diverged no longer define the normal install/update path.

Alternative considered: support both git and release flows in one state machine. Rejected for v1 because it creates two deployment models with conflicting invariants.

### Feishu exposure remains explicit and protected

Bots must explicitly configure protected task IDs:
- `update` -> builtin `self-update`
- `rollback` -> builtin `self-rollback`

If a bot does not configure one of these tasks, `/run update` or `/run rollback` must remain unavailable for that bot.

## Risks / Trade-offs

- [Release metadata and local directory state can drift after partial filesystem failures] -> Treat missing or inconsistent metadata as blocked update/rollback states with clear operator-facing repair guidance.
- [A bad release asset could replace a working install] -> Stage into `app.new`, verify entrypoints before swap, and retain `app.previous` for recovery.
- [Rollback depends on keeping exactly one previous local install] -> Explicitly document the single-step rollback model and always overwrite `app.previous` on successful update.
- [Release-based update needs network access to GitHub APIs/assets] -> Surface download and release lookup failures as clear blocked states without changing the current install.

## Migration Plan

1. Update `install.sh` so fresh installs record release metadata alongside the installed app.
2. Redefine update inspection and execution around release metadata and release asset lookup.
3. Add rollback helpers and protected task plumbing.
4. For existing installs without metadata, block update/rollback with a clear repair path until the install is refreshed through the new release-aware install flow.

Rollback strategy for this change:
- If the new updater fails during staging, leave the current install untouched.
- If the active app has already been swapped and service refresh fails, swap back to `app.previous` and rerun service install semantics.
- If that automatic restore succeeds, both CLI and Feishu flows must explicitly report that the update failed and that the service was restored to the previous version.
- If update execution fails after swap and the automatic restore also fails, both CLI and Feishu flows must explicitly report that update and rollback recovery both failed and that manual repair is required.

## Open Questions

None for v1. The release source is GitHub Releases, rollback targets only the single previous local install, and Feishu exposure remains explicit per bot.
