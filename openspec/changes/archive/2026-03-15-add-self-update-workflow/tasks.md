## 1. Update Planning

- [x] 1.1 Add `inspectUpdateState()` to validate the local git checkout, fetch upstream refs, and distinguish `up_to_date`, `update_available`, and `blocked`
- [x] 1.2 Enforce fast-forward-only updates and return clear operator-facing errors for dirty, ahead, diverged, missing-upstream, and fetch-failed states

## 2. CLI Workflow

- [x] 2.1 Add `kfc update` with local confirmation when a newer version is available
- [x] 2.2 Add `kfc update --yes` to skip confirmation without bypassing repository safety checks
- [x] 2.3 Implement `performSelfUpdate()` so the CLI reuses shared update execution, pulls code, refreshes installation, and prints final version information

## 3. Task and Feishu Workflow

- [x] 3.1 Add explicit config validation for task `update` so it only binds to builtin-tool `self-update`
- [x] 3.2 Implement builtin-tool `self-update` so `/run update` reuses the same inspect and execute phases as `kfc update`
- [x] 3.3 Ensure successful self-update refreshes the service through `kfc service install` semantics instead of restart-only handling
- [x] 3.4 Ensure Feishu-facing run summaries distinguish “already latest”, “update completed”, and step-specific failures

## 4. Verification

- [x] 4.1 Add tests for no-update, update-available, declined-confirmation, `--yes`, and invalid-repository-state behavior across CLI and builtin-tool paths
- [x] 4.2 Update README/example config/manual verification docs and validate the OpenSpec change
