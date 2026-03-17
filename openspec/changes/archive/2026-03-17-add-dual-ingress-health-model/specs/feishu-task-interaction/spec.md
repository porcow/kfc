## MODIFIED Requirements

### Requirement: Authorized users can discover tasks and start runs from Feishu text commands
The system SHALL allow an authorized Feishu user to request the list of available tasks from Feishu, inspect service health, and start task execution flows by sending structured text commands.

#### Scenario: Authorized user requests command help
- **WHEN** a Feishu user in the allowed user list invokes the bot help command
- **THEN** the system returns an informational help response that documents the supported text commands
- **AND** the help response includes at least `/health`, `/tasks`, `/run TASK_ID key=value ...`, `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, `/cron status`, `/run-status RUN_ID`, `/cancel RUN_ID`, and `/reload`
- **AND** the help response only references `/run sc` when the current bot has explicitly configured task `sc`
- **AND** the help response directs the user to `/tasks` for task-specific example commands rather than duplicating the full task catalog

#### Scenario: Authorized user requests bot health from Feishu in websocket-only mode
- **WHEN** a Feishu user in the allowed user list sends `/health`
- **AND** the active service ingress mode is `websocket-only`
- **THEN** the system returns an informational response that summarizes service readiness under the strict WebSocket-only policy
- **AND** it includes the active bot IDs and each bot's current WebSocket health state

#### Scenario: Authorized user requests bot health while webhook fallback is active
- **WHEN** a Feishu user in the allowed user list sends `/health`
- **AND** the active service ingress mode is `websocket-with-webhook-fallback`
- **THEN** the system returns an informational response that includes the ingress mode, each bot's effective availability, and the active ingress transport
- **AND** if a bot is available only through webhook fallback it marks that bot as degraded rather than reporting a generic failure
- **AND** it includes the current WebSocket state plus the latest webhook fallback observation details needed to explain that degraded-but-available state
