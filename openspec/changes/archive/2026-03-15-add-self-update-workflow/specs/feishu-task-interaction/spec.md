## MODIFIED Requirements

### Requirement: Authorized users can discover tasks and start runs from Feishu text commands
The system SHALL allow an authorized Feishu user to request the list of available tasks from Feishu, inspect service health, and start task execution flows by sending structured text commands.

#### Scenario: Authorized user requests self-update through the standard run flow
- **WHEN** an authorized Feishu user sends `/run update`
- **AND** the current bot has explicitly configured task `update`
- **THEN** the system treats `update` as a configured oneshot task
- **AND** it follows the standard confirmation flow before execution

#### Scenario: Bot omits explicit `update` task configuration
- **WHEN** a bot does not declare task `update`
- **THEN** `/run update` is rejected as an unknown task for that bot
- **AND** `/help` and `/tasks` do not advertise update as an available run target

### Requirement: Feishu users receive status and result updates
The system SHALL send status-oriented updates for a run and allow authorized users to query the final or current outcome by `run_id`.

#### Scenario: Update check reports no available update
- **WHEN** an authorized user confirms `/run update`
- **AND** the local service determines that no newer version is available from the tracked git remote
- **THEN** the run completes successfully without pulling code or reinstalling the service
- **AND** the Feishu-facing result clearly states that the service is already on the latest version

#### Scenario: Update check reports an available update
- **WHEN** an authorized user confirms `/run update`
- **AND** the local service determines that a newer version is available from the tracked git remote
- **THEN** the system executes the self-update workflow
- **AND** the final Feishu-facing result states that the update completed
- **AND** it includes the current version information

#### Scenario: Update execution failure is surfaced through run status
- **WHEN** `/run update` reaches the execution phase and fetch, pull, or install fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which update step failed
