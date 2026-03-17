## MODIFIED Requirements

### Requirement: Authorized users can discover tasks and start runs from Feishu text commands
The system SHALL allow an authorized Feishu user to request the list of available tasks from Feishu, inspect service health, and start task execution flows by sending structured text commands.

#### Scenario: Authorized user requests command help
- **WHEN** a Feishu user in the allowed user list invokes the bot help command
- **THEN** the system returns an informational help response that documents the supported text commands
- **AND** the help response includes at least `/server health`, `/server update`, `/server rollback`, `/tasks`, `/run TASK_ID key=value ...`, `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, `/cron status`, `/run-status RUN_ID`, `/cancel RUN_ID`, and `/reload`
- **AND** the help response only references `/run sc` when the current bot has explicitly configured task `sc`
- **AND** the help response directs the user to `/tasks` for task-specific example commands rather than duplicating the full task catalog

#### Scenario: Authorized user requests bot health from Feishu
- **WHEN** a Feishu user in the allowed user list sends `/server health`
- **THEN** the system returns an informational response that summarizes service readiness
- **AND** it includes the active bot IDs and each bot's current health details already defined for the active ingress mode

#### Scenario: Authorized user requests a screen capture through the standard run flow
- **WHEN** a Feishu user in the allowed user list sends `/run sc`
- **AND** the current bot has explicitly configured task `sc`
- **THEN** the system treats `sc` as a configured oneshot task
- **AND** it follows the standard confirmation flow before execution
- **AND** after confirmation it delivers the resulting screenshot back to the same Feishu chat where the command was issued

#### Scenario: Authorized user requests self-update through the service command flow
- **WHEN** an authorized Feishu user sends `/server update`
- **AND** the current bot has explicitly configured task `update`
- **THEN** the system routes the request into the same configured oneshot self-update task workflow previously used by `/run update`
- **AND** it follows the standard confirmation flow before execution

#### Scenario: Authorized user requests service rollback through the service command flow
- **WHEN** an authorized Feishu user sends `/server rollback`
- **AND** the current bot has explicitly configured task `rollback`
- **THEN** the system routes the request into the same configured oneshot rollback task workflow previously used by `/run rollback`
- **AND** it follows the standard confirmation flow before execution

#### Scenario: Authorized user requests the task list
- **WHEN** a Feishu user in the allowed user list invokes the bot's task-list action
- **THEN** the system returns the predefined one-shot tasks that are available to that user with their descriptions
- **AND** the returned card includes an example `/run TASK_ID key=value ...` command string for each listed task
- **AND** task `sc` appears only when the current bot has explicitly configured it

#### Scenario: Bot omits explicit `update` task configuration
- **WHEN** a bot does not declare task `update`
- **THEN** `/server update` is rejected as unavailable for that bot
- **AND** `/help` and `/tasks` do not advertise service update as an available action

#### Scenario: Bot omits explicit `rollback` task configuration
- **WHEN** a bot does not declare task `rollback`
- **THEN** `/server rollback` is rejected as unavailable for that bot
- **AND** `/help` and `/tasks` do not advertise service rollback as an available action

#### Scenario: Unauthorized user requests the task list
- **WHEN** a Feishu user outside the allowed user list invokes the bot's task-list action
- **THEN** the system refuses the request and returns an authorization failure message without exposing task details

#### Scenario: Unauthorized user receives a pairing command
- **WHEN** a Feishu user outside the allowed user list sends a supported command or card action
- **THEN** the system returns an authorization card that includes a one-time pairing code in the form `<bot_id>-<6 random alphanumeric characters>` and the exact local admin command `kfc pair <pair_code>`
- **AND** the authorization card does not expose the task catalog or task details

#### Scenario: Newly paired user can retry immediately
- **WHEN** a local administrator completes `kfc pair <pair_code>` successfully for a pending unauthorized user
- **THEN** that user can retry the original Feishu interaction without waiting for process restart
- **AND** subsequent authorized requests are evaluated against the updated `allowed_users`

### Requirement: Feishu-facing timestamps use one canonical display format
The system SHALL render every human-facing timestamp sent through the Feishu channel in the canonical local-time format `YYYY/MM/DD HH:mm:ss`.

#### Scenario: Run status card includes formatted timestamps
- **WHEN** the system renders a run status or run milestone card to Feishu
- **THEN** every displayed run timestamp, including start and finish times when present, uses the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Health reply includes formatted timestamps
- **WHEN** the system renders a `/server health` response to Feishu and includes any human-facing timestamp fields
- **THEN** those timestamps use the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Different Feishu reply paths stay consistent
- **WHEN** the system sends timestamps to Feishu through different reply paths such as command replies, interactive cards, or proactive monitoring notifications
- **THEN** every human-facing timestamp uses the same `YYYY/MM/DD HH:mm:ss` format rather than mixing ISO and local display styles

#### Scenario: Protocol-layer timestamps are out of scope
- **WHEN** the system exchanges requests, responses, or callback payloads with the Feishu server-side API
- **THEN** this display-format rule does not require changing any protocol-layer timestamp field
- **AND** only timestamps rendered into the Feishu chat UI for human readers are subject to the canonical format
