## MODIFIED Requirements

### Requirement: Authorized users can discover tasks and start runs from Feishu text commands
The system SHALL allow an authorized Feishu user to request the list of available tasks from Feishu, inspect service health, and start task execution flows by sending structured text commands.

#### Scenario: Authorized user requests command help
- **WHEN** a Feishu user in the allowed user list invokes the bot help command
- **THEN** the system returns an informational help response that documents the supported text commands
- **AND** the help response includes at least `/health`, `/tasks`, `/run TASK_ID key=value ...`, `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, `/cron status`, `/run-status RUN_ID`, `/cancel RUN_ID`, and `/reload`
- **AND** the help response only references `/run sc` when the current bot has explicitly configured task `sc`
- **AND** the help response only references `/run update` when the current bot has explicitly configured task `update`
- **AND** the help response only references `/run rollback` when the current bot has explicitly configured task `rollback`
- **AND** the help response directs the user to `/tasks` for task-specific example commands rather than duplicating the full task catalog

#### Scenario: Authorized user requests self-update through the standard run flow
- **WHEN** an authorized Feishu user sends `/run update`
- **AND** the current bot has explicitly configured task `update`
- **THEN** the system treats `update` as a configured oneshot task
- **AND** it follows the standard confirmation flow before execution

#### Scenario: Authorized user requests rollback through the standard run flow
- **WHEN** an authorized Feishu user sends `/run rollback`
- **AND** the current bot has explicitly configured task `rollback`
- **THEN** the system treats `rollback` as a configured oneshot task
- **AND** it follows the standard confirmation flow before execution

#### Scenario: Bot omits explicit `update` task configuration
- **WHEN** a bot does not declare task `update`
- **THEN** `/run update` is rejected as an unknown task for that bot
- **AND** `/help` and `/tasks` do not advertise update as an available run target

#### Scenario: Bot omits explicit `rollback` task configuration
- **WHEN** a bot does not declare task `rollback`
- **THEN** `/run rollback` is rejected as an unknown task for that bot
- **AND** `/help` and `/tasks` do not advertise rollback as an available run target

### Requirement: Feishu users receive status and result updates
The system SHALL send status-oriented updates for a run and allow authorized users to query the final or current outcome by `run_id`.

#### Scenario: Release update check reports no available update
- **WHEN** an authorized user confirms `/run update`
- **AND** the local service determines that no newer supported GitHub Release is available
- **THEN** the run completes successfully without downloading or reinstalling a release asset
- **AND** the Feishu-facing result clearly states that the service is already on the latest version

#### Scenario: Release update inspection uses only the latest stable release
- **WHEN** an authorized user confirms `/run update`
- **AND** the local service inspects remote release availability
- **THEN** it uses only the latest stable GitHub Release for update comparison
- **AND** it excludes draft and prerelease releases from update availability decisions

#### Scenario: Release update check reports an available update
- **WHEN** an authorized user confirms `/run update`
- **AND** the local service determines that a newer supported GitHub Release is available
- **THEN** the system executes the release-based self-update workflow
- **AND** the final Feishu-facing result states that the update completed
- **AND** it includes the current version information

#### Scenario: Update execution failure is surfaced through run status
- **WHEN** `/run update` reaches the execution phase and release lookup, download, extraction, dependency install, verification, or service refresh fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which update step failed

#### Scenario: Update execution failure reports successful automatic rollback
- **WHEN** `/run update` has already activated the staged app
- **AND** the subsequent service refresh fails
- **AND** the system successfully restores the previous local install automatically
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary states that the update failed
- **AND** it explicitly states that the service was rolled back to the restored previous version

#### Scenario: Update execution failure reports failed automatic rollback
- **WHEN** `/run update` has already activated the staged app
- **AND** the subsequent service refresh fails
- **AND** the system cannot restore the previous local install automatically
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary states that both update and automatic rollback failed
- **AND** it instructs the operator that manual recovery is required

#### Scenario: Rollback is unavailable
- **WHEN** an authorized user confirms `/run rollback`
- **AND** no previous locally installed version is available
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary clearly states that no rollback version is available

#### Scenario: Rollback completes successfully
- **WHEN** an authorized user confirms `/run rollback`
- **AND** a previous locally installed version is available
- **THEN** the system swaps to that previous version and refreshes the managed service
- **AND** the final Feishu-facing result states that rollback completed
- **AND** it includes the current version information

#### Scenario: Rollback execution failure is surfaced through run status
- **WHEN** `/run rollback` reaches the execution phase and validation, filesystem swap, or service refresh fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which rollback step failed

#### Scenario: Rollback execution failure reports automatic restore status
- **WHEN** `/run rollback` has already started swapping `app` and `app.previous`
- **AND** the subsequent validation or service refresh fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which rollback step failed
- **AND** it states whether the service was automatically restored to the last known runnable version or whether manual recovery is required
