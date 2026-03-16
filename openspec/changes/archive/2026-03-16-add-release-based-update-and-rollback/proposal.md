## Why

The current self-update workflow assumes the running app directory is a git working tree, but the host install flow downloads and extracts a GitHub tarball into `~/.local/share/kfc/app`. That means a normal `install.sh` deployment cannot satisfy the current update preconditions, so the shipped update feature is not aligned with the supported installation model.

## What Changes

- Replace git-working-tree-based self-update with a GitHub Release tarball workflow that matches the current host installation shape.
- Introduce persisted install metadata so the service can compare the currently installed release version with the latest available release.
- Redefine `kfc update` and `/run update` to download, stage, install, and activate a newer release asset instead of using `git fetch` / `git pull`.
- Add rollback entrypoints:
  - CLI: `kfc rollback`
  - Feishu: `/run rollback`
- Define a single-step rollback target: the immediately previous locally installed app version stored at `app.previous`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: local install, update, and rollback semantics change from git-checkout assumptions to GitHub Release tarball installation with persisted install metadata.
- `feishu-task-interaction`: Feishu `/run update` changes to release-based update semantics, and `/run rollback` is added for bots that explicitly configure the protected rollback task.

## Impact

- Affected code: [install.sh](/Users/porco/Projects/KidsAlfred/install.sh), [src/update.ts](/Users/porco/Projects/KidsAlfred/src/update.ts), [src/kfc.ts](/Users/porco/Projects/KidsAlfred/src/kfc.ts), [src/tools/self-update.ts](/Users/porco/Projects/KidsAlfred/src/tools/self-update.ts), config parsing for protected tasks, and service install/rollback helpers.
- Affected systems: GitHub Release assets, local app directories under `~/.local/share/kfc/`, launchd-managed service refresh, and bot-facing update/rollback flows.
- Breaking behavior: current git-specific update checks (`fast-forward`, `ahead`, `diverged`, `dirty working tree`) no longer define the supported installation/update model for normal installed deployments.
