## MODIFIED Requirements

### Requirement: The executor runs only predefined local tasks
The system SHALL execute only tasks declared in local configuration and SHALL start them on the bot's host machine using the declared runner kind and execution definition.

#### Scenario: Bot explicitly configures `update`
- **WHEN** a bot declares task `update`
- **THEN** the system accepts it only if it remains bound to `runner_kind = "builtin-tool"`, `execution_mode = "oneshot"`, and `tool = "self-update"`

### Requirement: The `kfc` is the controlled local execution and lifecycle interface
The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, controlled direct task execution, local health inspection, full user-local uninstall, and controlled self-update.

#### Scenario: Local admin runs `kfc update` and no newer version exists
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service determines that the tracked git remote does not contain a newer version than the current local checkout
- **THEN** the CLI reports that the service is already on the latest version
- **AND** it does not pull code or rerun installation

#### Scenario: Local admin confirms an available update
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service detects that a newer version exists
- **AND** the administrator confirms the update prompt
- **THEN** the system pulls the latest code
- **AND** it performs the installation step required to refresh the deployed service
- **AND** it reports that the update completed along with the current version information

#### Scenario: Local admin skips confirmation explicitly
- **WHEN** a local administrator executes `kfc update --yes`
- **AND** the local service detects that a newer version exists
- **THEN** the system skips the local confirmation prompt
- **AND** it still performs the same repository safety checks and update workflow as interactive `kfc update`

#### Scenario: Local admin declines an available update
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service detects that a newer version exists
- **AND** the administrator answers anything other than `y` or `yes`
- **THEN** the system aborts the update without modifying the working tree or reinstalling the service

#### Scenario: Self-update is blocked by unsafe local repository state
- **WHEN** `kfc update` is executed from a local checkout with uncommitted changes, missing remote tracking metadata, a local branch ahead of upstream, a diverged branch, or another unsupported repository state
- **THEN** the system returns a clear operator-facing error
- **AND** it does not attempt to pull or reinstall

#### Scenario: Update is only allowed when fast-forward is possible
- **WHEN** `kfc update` compares local `HEAD` and the tracked upstream branch after fetch
- **THEN** it proceeds only when the update can be applied as a fast-forward
- **AND** it refuses to auto-update branches that would require merge, rebase, or destructive reset

### Requirement: Every run is durably auditable
The system SHALL persist each run with the initiating user, task identifier, parameter summary, timestamps, final state, and result summary so the run can be queried after process restart.

#### Scenario: Authorized `/run update` executes the shared self-update workflow
- **WHEN** an authorized Feishu user confirms `/run update`
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
