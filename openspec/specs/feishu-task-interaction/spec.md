## Purpose
Define the Feishu-facing command, card, and reply behavior for task discovery, execution, run tracking, and authorization flows.
## Requirements
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

### Requirement: Requests are routed to the correct bot instance
The system SHALL route each inbound Feishu event or callback to the bot instance identified by the bot-scoped WebSocket session or HTTP path, and SHALL keep bot credentials and task catalogs isolated from each other.

#### Scenario: WebSocket event is received for bot A
- **WHEN** the process receives an event on bot A's Feishu WebSocket client
- **THEN** only bot A's task catalog, authorization rules, and response client are used to handle the event

#### Scenario: HTTP card callback is received on a bot-scoped path
- **WHEN** the process receives a card callback on `/bots/<id>/webhook/card`
- **THEN** it dispatches the request to the bot instance for `<id>` and does not expose any other bot's configuration

#### Scenario: Unknown bot path is requested
- **WHEN** the process receives an HTTP event or callback for a bot identifier that is not active
- **THEN** it rejects the request and does not route it to any bot instance

### Requirement: Task execution requires explicit confirmation
The system SHALL require an authorized user to submit task parameters through a structured `/run ...` text command, review the resulting pending request, and explicitly confirm execution before a run is created.

#### Scenario: User submits a valid run command
- **WHEN** an authorized user sends a valid `/run TASK_ID key=value ...` command for a predefined one-shot task
- **THEN** the system validates the parameters and returns a confirmation card summarizing the request
- **AND** the confirmation card exposes only `confirm` and `cancel` actions for that pending request

#### Scenario: User sends /run for a cronjob task
- **WHEN** an authorized user sends `/run TASK_ID ...` for a task whose execution mode is `cronjob`
- **THEN** the system rejects the request without creating a confirmation
- **AND** it returns a task-mode mismatch response directing the user to `/cron`

#### Scenario: User confirms a pending task request
- **WHEN** an authorized user clicks the `confirm` action on a pending confirmation card produced from a valid `/run ...` command
- **THEN** the system creates a new run record with a stable `run_id` and transitions it into executable state

#### Scenario: User submits invalid task parameters
- **WHEN** an authorized user sends a `/run ...` command whose parameters do not satisfy the selected one-shot task definition
- **THEN** the system rejects the request and returns validation feedback without creating a run

#### Scenario: User cancels a pending confirmation
- **WHEN** an authorized user clicks the `cancel` action on a pending confirmation card
- **THEN** the system discards the pending confirmation without creating a run
- **AND** it returns a cancellation acknowledgement to the user

### Requirement: Feishu users receive status and result updates
The system SHALL send status-oriented updates for a run and allow authorized users to query the final or current outcome by `run_id`.

#### Scenario: Confirmation returns the initial run card
- **WHEN** an authorized user clicks the `confirm` action on a valid pending confirmation
- **THEN** the system returns an informational run card for the newly created `run_id`
- **AND** that card includes at least `Run ID`, `Task`, `State`, `Actor`, and `Summary`

#### Scenario: Runtime pushes milestone updates to the originating chat
- **WHEN** a run transitions from `queued` to `running` or from a non-terminal state into a terminal state
- **THEN** the system sends an informational run card update to the originating Feishu chat
- **AND** it does not emit a separate Feishu message for each stdout or stderr chunk

#### Scenario: User views a running task status
- **WHEN** an authorized user requests status for a run that is not yet finished
- **THEN** the system returns the current lifecycle state, start time, and latest summary available for that `run_id`
- **AND** the returned status card is informational rather than parameter-collecting

#### Scenario: User views a completed task result
- **WHEN** an authorized user requests status for a completed run
- **THEN** the system returns the final state, completion time, and a result summary for that `run_id`
- **AND** the returned card includes `Run ID`, `Task`, `State`, `Actor`, `Started At`, `Finished At`, and `Summary`

#### Scenario: Result summary is concise and normalized
- **WHEN** the system renders a run result to Feishu
- **THEN** it prefers the task-level result summary or primary error message over raw stdout or stderr
- **AND** the rendered `Summary` is truncated to at most 300 characters with an ellipsis when needed
- **AND** the full stdout or stderr body is not inlined into the Feishu card

#### Scenario: Push delivery fails but result remains queryable
- **WHEN** the system cannot deliver an asynchronous run update card to Feishu
- **THEN** it still persists the authoritative run state locally
- **AND** an authorized user can retrieve the latest state later through `/run-status <run_id>`

#### Scenario: Duplicate confirmation is retried
- **WHEN** Feishu retries or repeats a previously accepted confirmation action
- **THEN** the system does not create a second run and returns the existing `run_id` or equivalent duplicate-safe response

### Requirement: Authorized users can manage cronjob tasks from Feishu
The system SHALL allow an authorized Feishu user to inspect and control configured cronjob tasks through `/cron` commands without mixing them into the one-shot `/run` flow.

#### Scenario: Authorized user lists cronjob tasks
- **WHEN** an authorized user sends `/cron list`
- **THEN** the system returns the configured cronjob tasks for that bot
- **AND** the response identifies each task as launchd-managed rather than one-shot
- **AND** the response includes whether the current chat is subscribed to each task and the current runtime state

#### Scenario: Authorized user starts a cronjob task
- **WHEN** an authorized user sends `/cron start TASK_ID` for a configured cronjob task
- **THEN** the system subscribes the current chat to that task
- **AND** it reconciles the corresponding launchd job into the started state if it is not already running
- **AND** if the job is already running it returns a duplicate-safe success response without restarting the job
- **AND** the response includes the task identifier and the resulting cronjob state summary

#### Scenario: Authorized user stops a cronjob task
- **WHEN** an authorized user sends `/cron stop TASK_ID` for a configured cronjob task
- **THEN** the system reconciles the corresponding launchd job into the stopped state
- **AND** it clears all persisted chat subscriptions for that task
- **AND** the response includes the task identifier and the resulting cronjob state summary

#### Scenario: Authorized user checks cronjob status
- **WHEN** an authorized user sends `/cron status`
- **THEN** the system returns the currently observed cronjob states for that bot's configured cronjob tasks
- **AND** the response reports observed `running` or `stopped` state for each task

### Requirement: Duplicate inbound deliveries do not produce duplicate replies
The system SHALL suppress duplicate Feishu message and card-action deliveries before they produce duplicate business handling or duplicate replies.

#### Scenario: Duplicate text message delivery is retried by Feishu
- **WHEN** Feishu delivers the same supported text message event more than once within the configured dedup window
- **THEN** the system processes the first delivery only once
- **AND** it does not emit a second reply card for the suppressed duplicate delivery

#### Scenario: Duplicate card action delivery is retried by Feishu
- **WHEN** Feishu delivers the same card action event more than once within the configured dedup window
- **THEN** the system processes the first delivery only once
- **AND** it does not emit a duplicate confirmation, cancellation, or result response for the suppressed duplicate delivery

### Requirement: Monitoring notifications are rendered as titled Feishu cards
The system SHALL render proactive `checkPDWin11` notifications as informational Feishu cards with explicit titles rather than body-only text messages.

#### Scenario: Startup monitoring notification is rendered as a card
- **WHEN** `checkPDWin11` emits an `off -> on` proactive notification
- **THEN** the Feishu delivery layer sends an informational card with the title `MC 启动!`

#### Scenario: Shutdown monitoring notification is rendered as a card
- **WHEN** `checkPDWin11` emits an `on -> off` proactive notification
- **THEN** the Feishu delivery layer sends an informational card with the title `MC 下线!`

#### Scenario: Runtime reminder is rendered as a titled card
- **WHEN** `checkPDWin11` emits an `on -> on` runtime reminder notification
- **THEN** the Feishu delivery layer sends an informational card whose title reflects the actual uptime, such as `MC 已运行 1小时20分`

#### Scenario: User sends /cron for a one-shot task
- **WHEN** an authorized user sends `/cron start TASK_ID` or `/cron stop TASK_ID` for a task whose execution mode is `oneshot`
- **THEN** the system rejects the request
- **AND** it returns a task-mode mismatch response stating that the task is not a cronjob task

### Requirement: Feishu-facing timestamps use one canonical display format
The system SHALL render every human-facing timestamp sent through the Feishu channel in the canonical local-time format `YYYY/MM/DD HH:mm:ss`.

#### Scenario: Run status card includes formatted timestamps
- **WHEN** the system renders a run status or run milestone card to Feishu
- **THEN** every displayed run timestamp, including start and finish times when present, uses the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Health reply includes formatted timestamps
- **WHEN** the system renders a `/health` response to Feishu and includes any human-facing timestamp fields
- **THEN** those timestamps use the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Different Feishu reply paths stay consistent
- **WHEN** the system sends timestamps to Feishu through different reply paths such as command replies, interactive cards, or proactive monitoring notifications
- **THEN** every human-facing timestamp uses the same `YYYY/MM/DD HH:mm:ss` format rather than mixing ISO and local display styles

#### Scenario: Protocol-layer timestamps are out of scope
- **WHEN** the system exchanges requests, responses, or callback payloads with the Feishu server-side API
- **THEN** this display-format rule does not require changing any protocol-layer timestamp field
- **AND** only timestamps rendered into the Feishu chat UI for human readers are subject to the canonical format

### Requirement: Authorized users can receive bot connection event notifications through Feishu
The system SHALL proactively notify subscribed authorized users when a bot first comes online in the current service session or when it reconnects after a sufficiently long outage.

#### Scenario: Bot sends an online notification after first successful connection in the current process session
- **WHEN** a bot instance reaches its first successful Feishu WebSocket `connected` state after the current service process session starts
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_online`
- **AND** the notification is delivered through user-directed Feishu messaging rather than a cron chat subscription

#### Scenario: Bot sends a reconnected notification after a long enough outage
- **WHEN** a bot instance transitions back to `connected` after previously entering a disconnected or reconnecting outage window
- **AND** the outage duration is at least 5 minutes
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_reconnected`
- **AND** the notification includes the bot recovery time and outage duration

#### Scenario: Short reconnect jitter does not produce a proactive notification
- **WHEN** a bot instance drops out of `connected` but reconnects in less than 5 minutes
- **THEN** the system does not send a `service_reconnected` notification

#### Scenario: Connection notifications use private user delivery
- **WHEN** the system delivers a bot connection event notification
- **THEN** it addresses the Feishu message to the subscribed user identity for that bot
- **AND** it does not require an originating chat from a prior command interaction

