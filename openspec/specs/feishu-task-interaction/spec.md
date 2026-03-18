## Purpose
Define the Feishu-facing command, card, and reply behavior for task discovery, execution, run tracking, and authorization flows.
## Requirements
### Requirement: Authorized users can discover tasks and start runs from Feishu text commands
The system SHALL allow an authorized Feishu user to request the list of available tasks from Feishu, inspect service health, inspect service version, submit protected host-execution scripts, and start task execution flows by sending structured text commands over the supported long-connection integration.

#### Scenario: Authorized user requests bot health
- **WHEN** a Feishu user in the allowed user list sends `/server health`
- **THEN** the system returns an informational response that summarizes readiness, each bot's effective availability, and WebSocket transport diagnostics
- **AND** it does not render a separate `Degraded` field
- **AND** it treats `websocket.state` as transport detail rather than the final availability verdict

#### Scenario: Authorized user submits a shell script
- **WHEN** a Feishu user in the allowed user list sends `/shell {script}`
- **AND** the current bot has explicitly configured task `shell`
- **THEN** the system validates that a non-empty shell script body was provided
- **AND** it returns a confirmation card that identifies the request as a shell execution with a bounded preview of the submitted script

#### Scenario: Authorized user submits an osascript
- **WHEN** a Feishu user in the allowed user list sends `/osascript {script}`
- **AND** the current bot has explicitly configured task `osascript`
- **THEN** the system validates that a non-empty AppleScript body was provided
- **AND** it returns a confirmation card that identifies the request as an osascript execution with a bounded preview of the submitted script

#### Scenario: Bot omits explicit `shell` task configuration
- **WHEN** a bot does not declare task `shell`
- **THEN** `/shell` is rejected as unavailable for that bot
- **AND** `/help` and `/tasks` do not advertise shell execution as an available action

#### Scenario: Bot omits explicit `osascript` task configuration
- **WHEN** a bot does not declare task `osascript`
- **THEN** `/osascript` is rejected as unavailable for that bot
- **AND** `/help` and `/tasks` do not advertise osascript execution as an available action

#### Scenario: Script commands require a non-empty body
- **WHEN** an authorized user sends `/shell` or `/osascript` without any script content
- **THEN** the system rejects the request without creating a confirmation
- **AND** it returns clear validation feedback indicating that script content is required

### Requirement: Requests are routed to the correct bot instance
The system SHALL route each inbound Feishu event or callback to the bot instance identified by the bot-scoped WebSocket session and SHALL keep bot credentials and task catalogs isolated from each other.

#### Scenario: WebSocket event is received for bot A
- **WHEN** the process receives an event on bot A's Feishu WebSocket client
- **THEN** only bot A's task catalog, authorization rules, and response client are used to handle the event

#### Scenario: WebSocket card action is received for bot A
- **WHEN** the process receives `card.action.trigger` through bot A's Feishu long connection
- **THEN** only bot A's task catalog, authorization rules, and response client are used to handle the action

#### Scenario: Unsupported HTTP callback path is requested
- **WHEN** the process receives an HTTP Feishu event or callback request for a bot-scoped webhook path
- **THEN** it rejects the request because bot-scoped Feishu HTTP ingress is no longer supported

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

#### Scenario: Release update check reports no available update
- **WHEN** an authorized user confirms `/server update`
- **AND** the local service determines that no newer supported GitHub Release is available
- **THEN** the run completes successfully without downloading or reinstalling a release asset
- **AND** the Feishu-facing result clearly states that the service is already on the latest version

#### Scenario: Release update inspection uses only the latest stable release
- **WHEN** an authorized user confirms `/server update`
- **AND** the local service inspects remote release availability
- **THEN** it uses only the latest stable GitHub Release for update comparison
- **AND** it excludes draft and prerelease releases from update availability decisions

#### Scenario: Release update check reports an available update
- **WHEN** an authorized user confirms `/server update`
- **AND** the local service determines that a newer supported GitHub Release is available
- **THEN** the system executes the release-based self-update workflow
- **AND** the final Feishu-facing result states that the update completed
- **AND** it includes the current version information

#### Scenario: Update execution failure is surfaced through run status
- **WHEN** `/server update` reaches the execution phase and release lookup, download, extraction, dependency install, verification, or service refresh fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which update step failed

#### Scenario: Update execution failure reports successful automatic rollback
- **WHEN** `/server update` has already activated the staged app
- **AND** the subsequent service refresh fails
- **AND** the system successfully restores the previous local install automatically
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary states that the update failed
- **AND** it explicitly states that the service was rolled back to the restored previous version

#### Scenario: Update execution failure reports failed automatic rollback
- **WHEN** `/server update` has already activated the staged app
- **AND** the subsequent service refresh fails
- **AND** the system cannot restore the previous local install automatically
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary states that both update and automatic rollback failed
- **AND** it instructs the operator that manual recovery is required

#### Scenario: Rollback is unavailable
- **WHEN** an authorized user confirms `/server rollback`
- **AND** no previous locally installed version is available
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary clearly states that no rollback version is available

#### Scenario: Rollback completes successfully
- **WHEN** an authorized user confirms `/server rollback`
- **AND** a previous locally installed version is available
- **THEN** the system swaps to that previous version and refreshes the managed service
- **AND** the final Feishu-facing result states that rollback completed
- **AND** it includes the current version information

#### Scenario: Rollback execution failure is surfaced through run status
- **WHEN** `/server rollback` reaches the execution phase and validation, filesystem swap, or service refresh fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which rollback step failed

#### Scenario: Rollback execution failure reports automatic restore status
- **WHEN** `/server rollback` has already started swapping `app` and `app.previous`
- **AND** the subsequent validation or service refresh fails
- **THEN** the run is marked failed
- **AND** the Feishu-facing run summary explains which rollback step failed
- **AND** it states whether the service was automatically restored to the last known runnable version or whether manual recovery is required

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
- **WHEN** the system renders a `/server health` response to Feishu and includes any human-facing timestamp fields
- **THEN** those timestamps use the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Different Feishu reply paths stay consistent
- **WHEN** the system sends timestamps to Feishu through different reply paths such as command replies, interactive cards, or proactive monitoring notifications
- **THEN** every human-facing timestamp uses the same `YYYY/MM/DD HH:mm:ss` format rather than mixing ISO and local display styles

#### Scenario: Protocol-layer timestamps are out of scope
- **WHEN** the system exchanges requests, responses, or callback payloads with the Feishu server-side API
- **THEN** this display-format rule does not require changing any protocol-layer timestamp field
- **AND** only timestamps rendered into the Feishu chat UI for human readers are subject to the canonical format

### Requirement: Authorized users can receive bot connection event notifications through Feishu
The system SHALL proactively notify subscribed authorized users when a bot first comes online in the current service session or when effective WebSocket availability returns after a sufficiently large heartbeat-success gap.

#### Scenario: Bot sends an online notification to subscribed users
- **WHEN** a bot first transitions into `connected` during the current main-service process session
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_online`
- **AND** the notification includes the bot identifier, connection time, and host context

#### Scenario: Bot sends a reconnected notification after a long enough heartbeat gap
- **WHEN** the reconnect evaluator succeeds while effective WebSocket availability is currently present
- **AND** the elapsed time since the previous successful heartbeat is at least 1 hour by default
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_reconnected`
- **AND** the notification includes the bot recovery time and heartbeat-gap duration

#### Scenario: Availability recovery does not wait for the next periodic tick
- **WHEN** effective WebSocket availability transitions from unavailable to available after sleep, reconnect, or the first new WebSocket ingress
- **AND** the reconnect threshold has already been exceeded since the previous successful heartbeat
- **THEN** the system may send `service_reconnected` shortly after that recovery edge
- **AND** it does not require waiting for the next periodic heartbeat timer boundary

#### Scenario: Short heartbeat gaps do not produce a proactive reconnect notification
- **WHEN** the reconnect evaluator succeeds while effective WebSocket availability is currently present
- **AND** the elapsed time since the previous successful heartbeat is less than the configured reconnect threshold
- **THEN** the system does not send a `service_reconnected` notification

### Requirement: Feishu integration remains functional under Bun-only runtime support
The system SHALL preserve its Feishu command, card, messaging, and upload behavior when Bun is the only supported runtime.

#### Scenario: Feishu SDK-dependent test paths remain runnable under Bun
- **WHEN** the project executes its supported Bun test suite
- **THEN** the Feishu SDK-dependent tests pass without relying on a Node runtime fallback

#### Scenario: Bun-only runtime preserves Feishu command handling
- **WHEN** the service handles Feishu text commands, long-connection card actions, and result delivery under the supported runtime
- **THEN** the system preserves the existing Feishu-facing behavior for task execution, status cards, health replies, and uploads

