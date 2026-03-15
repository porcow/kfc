## MODIFIED Requirements

### Requirement: Authorized users can discover tasks and start runs from Feishu text commands
The system SHALL allow an authorized Feishu user to request the list of available tasks from Feishu, inspect service health, and start task execution flows by sending structured text commands.

#### Scenario: Authorized user requests command help
- **WHEN** a Feishu user in the allowed user list invokes the bot help command
- **THEN** the system returns an informational help response that documents the supported text commands
- **AND** the help response includes at least `/health`, `/tasks`, `/run TASK_ID key=value ...`, `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, `/cron status`, `/run-status RUN_ID`, `/cancel RUN_ID`, and `/reload`
- **AND** the help response only references `/run sc` when the current bot has explicitly configured task `sc`
- **AND** the help response directs the user to `/tasks` for task-specific example commands rather than duplicating the full task catalog

#### Scenario: Authorized user requests bot health from Feishu
- **WHEN** a Feishu user in the allowed user list sends `/health`
- **THEN** the system returns an informational response that summarizes service readiness
- **AND** it includes the active bot IDs and each bot's current WebSocket health state

#### Scenario: Authorized user requests a screen capture through the standard run flow
- **WHEN** a Feishu user in the allowed user list sends `/run sc`
- **AND** the current bot has explicitly configured task `sc`
- **THEN** the system treats `sc` as a configured oneshot task
- **AND** it follows the standard confirmation flow before execution
- **AND** after confirmation it delivers the resulting screenshot back to the same Feishu chat where the command was issued

#### Scenario: Authorized user requests the task list
- **WHEN** a Feishu user in the allowed user list invokes the bot's task-list action
- **THEN** the system returns the predefined one-shot tasks that are available to that user with their descriptions
- **AND** the returned card includes an example `/run TASK_ID key=value ...` command string for each listed task
- **AND** task `sc` appears only when the current bot has explicitly configured it

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
