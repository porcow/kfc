## 1. Release Install Metadata

- [x] 1.1 Define a stable user-local metadata file for current and previous installed release versions.
- [x] 1.2 Define the embedded release metadata file included in every GitHub Release tarball and the exact required fields: `repo`, `version`, `channel`, `published_at`, and `asset_name`.
- [x] 1.3 Update `install.sh` and any shared install helpers to read embedded release metadata from the extracted app and record local install metadata during fresh installs.
- [x] 1.4 Define the exact local install metadata fields: `install_source`, `repo`, `channel`, `current_version`, `previous_version`, `installed_at`, and `previous_installed_at`.
- [x] 1.5 Add validation helpers for usable current-version and rollback metadata.

## 2. Release-Based Update Workflow

- [x] 2.1 Replace git-based update inspection with GitHub Release version inspection against persisted install metadata.
- [x] 2.2 Restrict update inspection to the latest stable GitHub Release and exclude draft/prerelease releases.
- [x] 2.2 Implement staged release update using `app.new`, `app`, and `app.previous`.
- [x] 2.3 Read embedded release metadata from the staged app before activating it and use it to rewrite local install metadata.
- [x] 2.4 Reuse `kfc service install` semantics after a successful release update and surface operator-facing version summaries.
- [x] 2.5 Surface explicit operator-facing outcomes when update fails after swap and automatic rollback succeeds or fails.

## 3. Rollback Workflow

- [x] 3.1 Add CLI rollback entrypoint `kfc rollback` with interactive and `--yes` paths.
- [x] 3.2 Implement local rollback by swapping `app` and `app.previous` and preserving the rolled-back-from version as the new rollback candidate.
- [x] 3.3 Rewrite local install metadata after rollback so current and previous versions match the swapped directories.
- [x] 3.4 Attempt automatic restoration when rollback fails after directory swap begins, and surface whether recovery succeeded.
- [x] 3.5 Add protected builtin task support so bots can explicitly expose `/run rollback`.

## 4. Feishu Integration

- [x] 4.1 Update Feishu help/task discovery so `update` and `rollback` are advertised only when explicitly configured.
- [x] 4.2 Update `/run update` to report release-based “already latest / updated / failed” outcomes instead of git-specific outcomes.
- [x] 4.3 Add `/run rollback` confirmation and result flows with clear success and no-rollback-available summaries.
- [x] 4.4 Surface explicit Feishu summaries for update failure with automatic rollback success/failure and rollback failure with automatic restore success/failure.

## 5. Verification

- [x] 5.1 Add unit tests for release metadata loading, release update inspection, staged update success/failure, and rollback success/failure.
- [x] 5.2 Update manual verification guidance for release install, update, and rollback flows.
- [x] 5.3 Validate the OpenSpec change and confirm it is ready for implementation.
