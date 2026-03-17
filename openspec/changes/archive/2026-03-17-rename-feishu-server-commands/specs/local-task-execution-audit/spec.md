## MODIFIED Requirements

### Requirement: Run persistence remains authoritative across service reloads and operator-facing status surfaces
The system SHALL persist run state transitions, summaries, timestamps, and selected metadata in the local SQLite store so that the same authoritative result remains available after reloads, restarts, and Feishu delivery failures.

#### Scenario: Persisted run status survives service restart
- **WHEN** a run transitions through queued, running, and terminal states and the service process later restarts
- **THEN** the persisted run record remains queryable by its original `run_id`
- **AND** the stored state, summary, and timestamps remain the source of truth after restart

#### Scenario: Persisted timestamps remain machine-canonical
- **WHEN** the system writes run lifecycle timestamps to persistence
- **THEN** it stores those timestamps in a machine-stable canonical format suitable for later rendering
- **AND** it formats them into `YYYY/MM/DD HH:mm:ss` during rendering rather than changing the stored values

#### Scenario: Push failure does not lose audit state
- **WHEN** a Feishu push update cannot be delivered after a run state transition is persisted
- **THEN** the persisted run record remains the source of truth
- **AND** a later `/run-status <run_id>` request returns the same canonical state and summary

#### Scenario: Authorized `/server update` executes the shared self-update workflow
- **WHEN** an authorized Feishu user confirms `/server update`
- **THEN** the system executes the same update check, confirmation outcome, pull, and install workflow used by `kfc update`
- **AND** the persisted run summary includes whether the service was already current or was updated successfully

#### Scenario: Shared self-update workflow is layered into inspect and execute phases
- **WHEN** either `kfc update` or builtin-tool `self-update` starts an update operation
- **THEN** the system first runs a shared inspection phase that determines `up_to_date`, `update_available`, or `blocked`
- **AND** it runs the execution phase only when inspection reports `update_available`

#### Scenario: Update result includes version information
- **WHEN** either `kfc update` or the builtin-tool `self-update` finishes successfully
- **THEN** the resulting operator-facing output includes the current version information derived from the local deployed checkout

#### Scenario: Update execution remains auditable
- **WHEN** the builtin-tool `self-update` runs through the standard one-shot execution system
- **THEN** the system persists the resulting run state and summary just like any other one-shot task
- **AND** later `/run-status <run_id>` returns the canonical persisted update result

#### Scenario: Successful update refreshes the managed service through install semantics
- **WHEN** the system completes a successful self-update
- **THEN** it refreshes the managed service using the same service-install semantics as `kfc service install`
- **AND** it does not rely on a lighter-weight restart-only path
