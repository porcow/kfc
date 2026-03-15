## Purpose
Define the local execution, persistence, audit, lifecycle, and service-management behavior that must remain durable and operator-auditable across runs and restarts.
## Requirements
### Requirement: The `sc` oneshot task captures the current screen and returns it through Feishu
The system SHALL support a configured oneshot task `sc`, backed by the builtin-tool `screencapture`, that captures the current macOS screen, stores the image temporarily on disk, sends it back through the Feishu SDK to the originating chat, and removes the temporary file after successful delivery.

#### Scenario: Authorized `/run sc` request triggers the configured screencapture task
- **WHEN** an authorized Feishu user issues `/run sc` and confirms execution
- **AND** the current bot has explicitly configured task `sc`
- **THEN** the system resolves the configured oneshot task `sc`
- **AND** it executes the underlying builtin-tool `screencapture` on the host machine

#### Scenario: Screenshot file is written to the default work data directory
- **WHEN** the `sc` task starts successfully
- **THEN** the system writes the captured image to `$HOME/.kfc/data/screenshot-{datetime}.png`
- **AND** the generated filename is unique enough for repeated operator use

#### Scenario: Screenshot is sent back to the originating chat
- **WHEN** the `sc` task completes image capture successfully
- **THEN** the system uploads the generated image through the Feishu SDK
- **AND** it sends the image message to the same chat that issued `/run sc`

#### Scenario: Temporary screenshot file is deleted after successful delivery
- **WHEN** the screenshot image has been uploaded and sent successfully through Feishu
- **THEN** the system deletes the corresponding `$HOME/.kfc/data/screenshot-{datetime}.png` file

#### Scenario: Failed Feishu delivery retains the screenshot file
- **WHEN** the screenshot image is captured successfully but Feishu upload or send fails
- **THEN** the system leaves the generated screenshot file on disk
- **AND** it reports a clear failure rather than silently claiming success

#### Scenario: Screenshot capture failure does not attempt image delivery
- **WHEN** the host cannot capture the current screen successfully
- **THEN** the system fails the `sc` task
- **AND** it does not attempt to upload or send a screenshot image to Feishu

#### Scenario: Bot omits explicit `sc` configuration
- **WHEN** a bot does not declare `[bots.<id>.tasks.sc]` in local configuration
- **THEN** the bot does not expose task `sc` in its active task registry
- **AND** `/run sc` is rejected as an unknown task for that bot

#### Scenario: Bot explicitly configures `sc`
- **WHEN** a bot declares `[bots.<id>.tasks.sc]` in local configuration
- **THEN** the system accepts it only if it remains bound to `runner_kind = "builtin-tool"`, `execution_mode = "oneshot"`, and `tool = "screencapture"`
- **AND** the bot exposes task `sc` through its active task registry

### Requirement: The executor runs only predefined local tasks
The system SHALL execute only tasks declared in local configuration and SHALL start them on the bot's host machine using the declared runner kind and execution definition.

#### Scenario: Registered task starts successfully
- **WHEN** the system receives a confirmed request for a configured task
- **THEN** it invokes the corresponding built-in tool entrypoint or external command on the host machine and records the start of execution

#### Scenario: Unknown task is requested
- **WHEN** the system receives a request for a task identifier that is not present in local configuration
- **THEN** it rejects the request and does not spawn any local process

#### Scenario: Bot explicitly configures `update`
- **WHEN** a bot declares task `update`
- **THEN** the system accepts it only if it remains bound to `runner_kind = "builtin-tool"`, `execution_mode = "oneshot"`, and `tool = "self-update"`

### Requirement: Each bot has an isolated task registry and run store
The system SHALL keep each bot's allowed users, task definitions, pending confirmations, and run history isolated from every other bot loaded in the same process.

#### Scenario: Two bots define different task catalogs
- **WHEN** bot A and bot B are active with different task definitions
- **THEN** a request handled by bot A only sees bot A's task catalog and cannot execute bot B's tasks

#### Scenario: Two bots store runs concurrently
- **WHEN** bot A and bot B both create runs in the same process
- **THEN** each run is recorded only in that bot's configured SQLite store and remains queryable through that bot instance

#### Scenario: Pairing records stay bot-scoped
- **WHEN** bot A and bot B both have pending pairing requests
- **THEN** a pairing code created for bot A cannot authorize a user on bot B
- **AND** each bot stores and resolves its pairing records only from its own configured SQLite store

### Requirement: Multi-bot configuration is validated atomically
The system SHALL validate the entire `[bots.<id>]` configuration set before activating a reload or startup configuration change.

#### Scenario: One bot entry is invalid during reload
- **WHEN** the updated configuration contains one invalid bot definition and one otherwise valid bot definition
- **THEN** the system keeps the full previously active bot map and does not partially activate the valid bot definition

#### Scenario: A new bot entry is added successfully
- **WHEN** the updated configuration adds a valid new `[bots.<id>]` section and reload validation succeeds
- **THEN** the system activates the new bot alongside the existing active bots

### Requirement: Predefined tasks separate runner kind from execution mode
The system SHALL support exactly two runner kinds in v1, `builtin-tool` and `external-command`, and exactly two execution modes, `oneshot` and `cronjob`.

#### Scenario: Built-in tool task is selected
- **WHEN** a configured task has runner kind `builtin-tool`
- **THEN** the system resolves the named built-in tool entrypoint and executes it through the controlled local runner boundary

#### Scenario: External-command task is selected
- **WHEN** a configured task has runner kind `external-command`
- **THEN** the system launches only the configured binary or script path with validated parameters as a child process

#### Scenario: One-shot task is selected
- **WHEN** a configured task has execution mode `oneshot`
- **THEN** it is eligible for Feishu `/run ...` execution flow and persisted as a run record

#### Scenario: Cronjob task is selected
- **WHEN** a configured task has execution mode `cronjob`
- **THEN** it is eligible for launchd-backed management and Feishu `/cron ...` commands
- **AND** it is not eligible for direct `/run ...` execution

#### Scenario: Cronjob task omits schedule metadata
- **WHEN** the active task configuration contains a `cronjob` task without a cron expression or without an explicit `auto_start` flag
- **THEN** the system rejects that configuration as invalid and does not activate it

#### Scenario: Task configuration declares an unsupported runner kind or execution mode
- **WHEN** the active task configuration contains a runner kind or execution mode other than the supported v1 values
- **THEN** the system rejects that configuration as invalid and does not activate it

### Requirement: Task registry activation is explicit and controlled
The system SHALL activate task configuration changes only after an explicit reload operation or a controlled service restart.

#### Scenario: Task configuration is changed on disk but not reloaded
- **WHEN** a local task definition file changes and no reload or restart has occurred
- **THEN** the system continues using the previously active task registry

#### Scenario: Explicit reload activates a valid task change
- **WHEN** an authorized reload operation validates the updated task configuration successfully
- **THEN** the system replaces the active task registry with the new configuration and exposes the updated task catalog to subsequent requests

#### Scenario: Explicit reload encounters invalid configuration
- **WHEN** an authorized reload operation detects an invalid task configuration
- **THEN** the system keeps the previous active task registry and reports the reload failure

### Requirement: Local pairing updates authorization immediately
The system SHALL support a local admin pairing command that resolves pending unauthorized-user requests, updates `allowed_users`, and activates the new authorization state without process restart.

#### Scenario: Local admin completes a valid pairing
- **WHEN** `kfc pair <pair_code>` is executed on the host for an existing unexpired pending pairing request
- **THEN** the system adds the corresponding actor identifier to that bot's `allowed_users`
- **AND** it triggers a local reload flow that activates the updated authorization state immediately
- **AND** it marks the pairing code as used only after the reload succeeds

#### Scenario: Pairing code is invalid or expired
- **WHEN** `kfc pair <pair_code>` is executed with an unknown, expired, already-used, malformed, or mismatched code
- **THEN** the system rejects the authorization attempt
- **AND** it does not update `allowed_users`

#### Scenario: Reload fails after TOML authorization update attempt
- **WHEN** the local pairing tool updates the TOML source but the immediate reload fails validation or activation
- **THEN** the system reports the failure to the local administrator
- **AND** it does not mark the pairing code as successfully consumed

#### Scenario: Pair code is globally unique and bot-scoped
- **WHEN** the system generates a new pairing code
- **THEN** the code uses the form `<bot_id>-<6 random alphanumeric characters>`
- **AND** the code can be resolved to exactly one bot and one pending pairing request

### Requirement: The executor enforces lifecycle controls
The system SHALL track run state transitions and enforce configured timeout and cancellation behavior for each run.

#### Scenario: Task exceeds its timeout
- **WHEN** a running task exceeds its configured timeout
- **THEN** the system terminates the execution, marks the run as `timed_out`, and records the timeout event

#### Scenario: User cancels a cancellable task
- **WHEN** an authorized user requests cancellation for a running task that allows cancellation
- **THEN** the system stops the execution and marks the run as `cancelled`

#### Scenario: User cancels a non-cancellable task
- **WHEN** an authorized user requests cancellation for a running task that does not allow cancellation
- **THEN** the system refuses the cancellation and keeps the run in its current state

### Requirement: Every run is durably auditable
The system SHALL persist each run with the initiating user, task identifier, parameter summary, timestamps, final state, and result summary so the run can be queried after process restart.

#### Scenario: Completed run remains queryable after restart
- **WHEN** the bot process restarts after a run has been recorded
- **THEN** an authorized user can still query that `run_id` and receive the persisted execution details

#### Scenario: Failed task is audited
- **WHEN** a local task exits with a non-zero result
- **THEN** the system marks the run as `failed` and persists a failure summary for later lookup

#### Scenario: Feishu-facing summary is derived from persisted run data
- **WHEN** the system renders an informational run card for push or pull delivery
- **THEN** it derives the card fields from the persisted run record rather than transient process-local state
- **AND** the persisted run record contains enough data to populate `Run ID`, `Task`, `State`, `Actor`, timestamps, and the normalized summary

#### Scenario: Persisted run record remains the source of truth for formatted Feishu timestamps
- **WHEN** the system prepares a Feishu-facing run card from persisted run data
- **THEN** it reads the canonical persisted timestamps from the run record
- **AND** it formats them into `YYYY/MM/DD HH:mm:ss` during rendering rather than changing the stored values

#### Scenario: Push failure does not lose audit state
- **WHEN** a Feishu push update cannot be delivered after a run state transition is persisted
- **THEN** the persisted run record remains the source of truth
- **AND** a later `/run-status <run_id>` request returns the same canonical state and summary

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

### Requirement: Cronjob state is persisted separately from one-shot runs
The system SHALL persist cronjob management state independently from one-shot run history so launchd-managed tasks can be queried and reconciled by `task_id`.

#### Scenario: Cronjob state remains queryable after restart
- **WHEN** the service restarts after recording cronjob desired and observed state for a configured cronjob task
- **THEN** `/cron status` can still return that task's last known runtime state after restart

#### Scenario: One-shot and cronjob state do not share identifiers
- **WHEN** the system stores one-shot runs and cronjob task state for the same bot
- **THEN** one-shot audit records remain keyed by `run_id`
- **AND** cronjob state remains keyed by `task_id`

#### Scenario: Cron chat subscriptions are persisted separately from runtime state
- **WHEN** the system stores cron runtime state and chat subscriptions for the same cronjob task
- **THEN** runtime state remains keyed by `(bot_id, task_id)`
- **AND** subscription state remains keyed by `(bot_id, task_id, chat_id)`
- **AND** removing subscriptions does not by itself erase the persisted runtime state record

### Requirement: `kfc` is the controlled local execution and lifecycle interface
The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, controlled direct task execution, local health inspection, full user-local uninstall, and controlled self-update.

#### Scenario: Local admin installs and starts the service with an explicit config path
- **WHEN** a local administrator executes `kfc service install --config /path/to/bot.toml`
- **THEN** the system writes or refreshes the main-service plist at `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it installs launchd management for the main service under the stable label `com.kidsalfred.service`
- **AND** it starts the main service immediately
- **AND** installation triggers configuration validation and cronjob reconciliation

#### Scenario: Local admin installs and starts the service with the default config path
- **WHEN** a local administrator executes `kfc service install` without `--config`
- **THEN** the system resolves the service config path to `~/.config/kfc/config.toml`
- **AND** it writes or refreshes the main-service plist at `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it installs launchd management for the main service under the stable label `com.kidsalfred.service`
- **AND** it starts the main service immediately
- **AND** installation triggers configuration validation and cronjob reconciliation

#### Scenario: Local admin installs without an explicit config and the default file is missing
- **WHEN** a local administrator executes `kfc service install` without `--config`
- **AND** `~/.config/kfc/config.toml` does not exist
- **THEN** the system returns a clear operator-facing error that names the missing default config path
- **AND** it does not install launchd management for the main service

#### Scenario: Local admin starts or restarts an installed service
- **WHEN** a local administrator executes `kfc service start` or `kfc service restart`
- **THEN** the system manages the main service process through a macOS-compatible lifecycle interface
- **AND** startup or restart triggers configuration validation and cronjob reconciliation

#### Scenario: Local admin uninstalls the managed service
- **WHEN** a local administrator executes `kfc service uninstall`
- **THEN** the system stops the managed service first if it is running
- **AND** it unloads every launchd-managed cronjob derived from the installed config for every configured bot
- **AND** it removes each cronjob plist file used by those bot-scoped cronjobs
- **AND** it removes `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it cancels launchd management for the main service

#### Scenario: Cronjob uninstall falls back to scanning the work directory when the service plist is missing
- **WHEN** a local administrator executes `kfc service uninstall`
- **AND** `~/Library/LaunchAgents/com.kidsalfred.service.plist` is missing before cron cleanup can derive `KIDS_ALFRED_CONFIG`
- **THEN** the system scans `~/.kfc/**/launchd/*.plist` for KFC-managed cronjob plists
- **AND** it attempts to unload each discovered cronjob from launchd
- **AND** it removes each discovered cronjob plist file

#### Scenario: Cronjob uninstall falls back to scanning the work directory when installed config cannot be resolved
- **WHEN** a local administrator executes `kfc service uninstall`
- **AND** the installed main-service plist exists but cannot be read, does not declare `KIDS_ALFRED_CONFIG`, or references a config that cannot be loaded
- **THEN** the system continues uninstall by scanning `~/.kfc/**/launchd/*.plist` for KFC-managed cronjob plists
- **AND** it attempts to unload each discovered cronjob from launchd
- **AND** it removes each discovered cronjob plist file

#### Scenario: Cronjob uninstall continues across multiple tasks
- **WHEN** `kfc service uninstall` needs to unload multiple configured cronjob launchd jobs
- **THEN** it attempts cleanup for each configured cronjob rather than stopping after the first one

#### Scenario: Fallback cronjob uninstall continues across multiple discovered plists
- **WHEN** `kfc service uninstall` uses the filesystem-scan fallback and finds multiple KFC cronjob plists
- **THEN** it attempts cleanup for each discovered cronjob plist rather than stopping after the first one

#### Scenario: Cronjob cleanup failure is surfaced
- **WHEN** `kfc service uninstall` cannot unload or remove one of the configured cronjob launchd jobs
- **THEN** the system reports a clear operator-facing uninstall error or warning that identifies the affected cronjob
- **AND** it still attempts cleanup for the remaining configured cronjobs

#### Scenario: Fallback cronjob cleanup failure is surfaced
- **WHEN** `kfc service uninstall` cannot unload or remove one of the cronjob plists discovered through the filesystem-scan fallback
- **THEN** the system reports a clear operator-facing uninstall error or warning that identifies the affected plist or launchd label
- **AND** it still attempts cleanup for the remaining discovered cronjob plists

#### Scenario: Local admin performs a full uninstall through the CLI
- **WHEN** a local administrator executes `kfc uninstall`
- **THEN** the system presents a destructive-action confirmation prompt before removing files
- **AND** after confirmation it performs the same user-local removal covered by the host uninstall flow, including launchd state, installed app files, local launcher, default config file, and work directory

#### Scenario: Local admin declines full uninstall confirmation
- **WHEN** a local administrator executes `kfc uninstall`
- **AND** responds with anything other than `y` or `yes`
- **THEN** the system aborts full uninstall without removing files or launchd state

#### Scenario: Non-interactive full uninstall is explicitly requested
- **WHEN** a local administrator executes `kfc uninstall --yes`
- **THEN** the system skips the confirmation prompt
- **AND** it performs the same full uninstall actions as the interactive confirmed path

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

#### Scenario: Local admin stops the service
- **WHEN** a local administrator executes `kfc service stop`
- **THEN** the system stops the main service process without rewriting configured cronjob policy

#### Scenario: Start, restart, or stop on an uninstalled service returns a clear error
- **WHEN** a local administrator executes `kfc service start`, `kfc service restart`, or `kfc service stop` before the main-service plist has been installed
- **THEN** the system returns a clear operator-facing error describing that the service is not installed
- **AND** it does not silently succeed

#### Scenario: Local admin inspects service health through the CLI
- **WHEN** a local administrator executes `kfc health`
- **THEN** the system queries the running service's configured health endpoint over loopback
- **AND** it returns the same canonical health snapshot exposed by HTTP `/health`

#### Scenario: Local admin requests health while the managed service is unreachable
- **WHEN** a local administrator executes `kfc health`
- **AND** the configured local health endpoint cannot be reached
- **THEN** the system returns a clear operator-facing error rather than synthetic or stale health data

#### Scenario: Local admin executes a configured task directly
- **WHEN** a local administrator executes `kfc exec --bot BOT_ID --task TASK_ID`
- **THEN** the system runs that configured task directly on the host without requiring Feishu confirmation
- **AND** it rejects unknown tasks or bots

### Requirement: Service startup and reload reconcile launchd-managed cronjobs
The system SHALL reconcile configured cronjob tasks against `launchctl` state on startup and reload.

#### Scenario: Cron expression is translated into launchd schedule data
- **WHEN** the system activates a valid cronjob task from TOML
- **THEN** it translates the configured cron expression into the supported launchd plist schedule representation
- **AND** it rejects cron expressions that cannot be translated safely in v1

#### Scenario: Auto-start disabled cronjob is found running
- **WHEN** a configured cronjob task has `auto_start = false` and `launchctl` reports it as running during startup or reload
- **THEN** the system stops that cronjob

#### Scenario: Auto-start enabled cronjob is already running
- **WHEN** a configured cronjob task has `auto_start = true` and `launchctl` reports it as running during startup or reload
- **THEN** the system stops the cronjob and then starts it again

#### Scenario: Auto-start enabled cronjob is not running
- **WHEN** a configured cronjob task has `auto_start = true` and `launchctl` reports it as not running during startup or reload
- **THEN** the system starts that cronjob

#### Scenario: Service stop does not rewrite cronjob policy
- **WHEN** a local administrator executes `kfc service stop`
- **THEN** the system stops the main service process
- **AND** it does not rewrite the configured `auto_start` policy for cronjob tasks

### Requirement: Monitoring-style cron tasks deliver through subscriptions rather than fixed destinations
The system SHALL allow monitoring-style cron tasks to emit proactive notification payloads without declaring a fixed `notification_chat_id` in TOML, and SHALL let the outer execution layer resolve subscribed chats at delivery time.

#### Scenario: Monitor task configuration omits fixed notification destination
- **WHEN** a monitoring-style cron task is configured without a fixed `notification_chat_id`
- **THEN** the system accepts that task configuration
- **AND** the task remains eligible for proactive notification delivery through subscribed chats

#### Scenario: Outer execution layer resolves subscribed chats for delivery
- **WHEN** a monitoring-style cron task emits a proactive notification payload during `kfc exec --bot BOT_ID --task TASK_ID`
- **THEN** the outer execution layer resolves the subscribed chats for that `(BOT_ID, TASK_ID)`
- **AND** it fans out delivery using that bot's Feishu credentials

#### Scenario: Cron start on an already running job is idempotent for runtime state
- **WHEN** `/cron start TASK_ID` is issued for a cronjob task whose launchd job is already running
- **THEN** the system keeps the task in the running state
- **AND** it does not restart the launchd job solely because of the duplicate start request
- **AND** it may still upsert the current chat's subscription membership

### Requirement: Ingress dedup is stored durably per bot
The system SHALL persist ingress dedup keys in the bot-scoped SQLite store so duplicate delivery suppression does not depend on process memory.

#### Scenario: Duplicate delivery after a short reconnect is still suppressed
- **WHEN** a duplicate Feishu event arrives after the process has already recorded the original event within the configured dedup window
- **THEN** the system suppresses the duplicate based on the persisted ingress dedup store

### Requirement: Duplicate suppressions are audit logged
The system SHALL log when a duplicate ingress event is intentionally suppressed.

#### Scenario: Duplicate suppression is written to the event log
- **WHEN** a duplicate message or card action is suppressed
- **THEN** the system records a structured event-log entry with decision `duplicate_suppressed`
- **AND** the log includes the inbound event type and command or action classification when available

### Requirement: Built-in tool notification intents support titled proactive cards
The system SHALL allow built-in tools to return proactive notification intents that include both a card title and body content so the outer runner can render informational Feishu cards without tool-local SDK ownership.

#### Scenario: Built-in tool returns a titled proactive notification
- **WHEN** a built-in tool produces a proactive Feishu notification intent
- **THEN** the notification contract includes a title field and body field
- **AND** the outer runner can deliver that notification without inferring the title from free-form text

### Requirement: Durable monitor state tracks runtime reminder timing
The system SHALL persist the reminder timing metadata required by monitor-style built-in tools to suppress duplicate runtime reminders across cron invocations and process restarts.

#### Scenario: Runtime reminder timestamp is persisted
- **WHEN** `checkPDWin11` emits a runtime reminder notification
- **THEN** the persisted monitor-state record stores the reminder send time

#### Scenario: Missing reminder metadata is treated as no prior reminder
- **WHEN** a previously persisted monitor-state row predates the runtime-reminder feature and lacks runtime-reminder timing metadata
- **THEN** the next `checkPDWin11` invocation treats that row as having no prior runtime reminder recorded

### Requirement: Feishu-facing audit timestamps are formatted at render time
The system SHALL preserve canonical persisted run and monitor timestamps internally, and SHALL format those timestamps into `YYYY/MM/DD HH:mm:ss` only when rendering Feishu-facing content.

#### Scenario: Persisted timestamps are formatted only at Feishu render time
- **WHEN** the system prepares a Feishu-facing card or reply from persisted run or monitor state
- **THEN** it leaves the stored timestamps unchanged in persistence
- **AND** it formats the displayed values into `YYYY/MM/DD HH:mm:ss` during rendering

### Requirement: Inbound Feishu interactions are logged as structured decisions
The system SHALL emit a structured audit log entry for each supported inbound Feishu message or card action that reaches bot business logic, including rejected and invalid requests.

#### Scenario: Authorized message command is logged
- **WHEN** an authorized user sends a supported Feishu text command such as `/tasks`, `/run ...`, `/run-status ...`, `/cancel ...`, or `/reload`
- **THEN** the system records a structured event log entry containing at least the timestamp, `bot_id`, `event_type`, `actor_id`, normalized command type, and resulting decision
- **AND** the entry includes `task_id`, `run_id`, or `confirmation_id` when those identifiers are created or referenced

#### Scenario: Unauthorized interaction is logged without exposing secrets
- **WHEN** an unauthorized user sends a supported Feishu message or card action
- **THEN** the system records a structured event log entry with an `authorization_required` or equivalent rejection decision
- **AND** it does not log the plaintext pairing code, full task catalog, or full raw Feishu payload

#### Scenario: Invalid command or validation failure is logged
- **WHEN** a Feishu user sends an unsupported command or a malformed `/run ...` request
- **THEN** the system records a structured event log entry with an `invalid_command` or `validation_failed` decision
- **AND** it includes only a concise error summary rather than full user-supplied parameter bodies

#### Scenario: Card confirmation decision is logged
- **WHEN** a user clicks `confirm` or `cancel` on a pending confirmation card
- **THEN** the system records a structured event log entry for the resulting decision
- **AND** the entry references the affected `confirmation_id`
- **AND** it references the resulting `run_id` when confirmation creates a run

#### Scenario: Event logging is separate from run audit persistence
- **WHEN** the system both logs an inbound interaction and persists run lifecycle state
- **THEN** the structured event log remains a higher-level interaction trail
- **AND** the persisted run record remains the source of truth for execution state, timestamps, and result summary

### Requirement: Bot WebSocket health is observable
The system SHALL expose bot-scoped WebSocket connection health so operators can distinguish process availability from Feishu event-ingress availability.

#### Scenario: Health endpoint shows connected bot event ingress
- **WHEN** a bot's Feishu WebSocket client is connected and receiving heartbeats normally
- **THEN** the health or diagnostic surface reports that bot as connected
- **AND** it includes the last successful connection time

#### Scenario: Bot is reconnecting after a disconnect
- **WHEN** a bot's Feishu WebSocket client loses its long connection and schedules a reconnect attempt
- **THEN** the health or diagnostic surface reports that bot as reconnecting
- **AND** it includes the next reconnect attempt time when known
- **AND** it increments a consecutive reconnect failure count until a successful reconnection occurs

#### Scenario: Process is healthy but event ingress is degraded
- **WHEN** the Node.js process is running but one or more bot WebSocket clients are disconnected or reconnecting
- **THEN** the health or diagnostic output distinguishes that degraded state from full bot readiness
- **AND** it does not report all bots as fully healthy solely because the HTTP process is up

#### Scenario: Service shutdown closes WebSocket without replacement
- **WHEN** the process is intentionally stopping and closes a bot's WebSocket client as part of shutdown
- **THEN** the system does not attempt to establish a replacement long connection for that stopping process

#### Scenario: Reload closes old runtime but starts replacement connection
- **WHEN** the system reloads configuration and intentionally closes the old runtime for an existing bot or a replaced bot definition
- **THEN** it starts the newly active runtime's WebSocket client for that bot before considering event ingress restored
- **AND** it does not rely on the closed runtime's internal reconnect loop to recover ingress

### Requirement: Sustained WebSocket failure has a documented operator fallback
The system SHALL provide an operator-visible signal when WebSocket event ingress remains unavailable long enough that a switch to Webhook delivery should be considered.

#### Scenario: Reconnect failures exceed the operator threshold
- **WHEN** a bot exceeds the configured or documented threshold for consecutive reconnect failures
- **THEN** the system emits an operator-facing warning that references the prepared Webhook event endpoint for that bot
- **AND** it does not automatically enable dual-active delivery or change the Feishu subscription mode

#### Scenario: Successful reconnection clears the sustained-failure condition
- **WHEN** a bot reconnects successfully after one or more failed reconnect attempts
- **THEN** the consecutive reconnect failure count resets
- **AND** the health surface reflects the restored connected state

### Requirement: Bot connection event subscriptions are persisted and reconciled from allowlists
The system SHALL persist service-level event subscriptions separately from task and cron subscriptions, and SHALL reconcile them against each bot's `allowed_users`.

#### Scenario: Allowlisted user receives default service event subscriptions
- **WHEN** a bot starts or reloads configuration with an `allowed_users` entry not yet present in service event subscriptions
- **THEN** the system creates enabled default subscriptions for that actor for `service_online` and `service_reconnected`

#### Scenario: Removed allowlisted user loses service event subscriptions
- **WHEN** a bot reloads configuration and an actor is no longer present in that bot's `allowed_users`
- **THEN** the system removes or disables that actor's persisted service event subscriptions for that bot

#### Scenario: Service event subscriptions remain bot-scoped
- **WHEN** multiple bots are loaded in the same process
- **THEN** each bot persists and resolves its own service event subscriptions independently by `bot_id`

### Requirement: Bot connection event state is persisted independently from run and cron state
The system SHALL persist service connection-event state per bot so reconnect detection survives process restarts and remains separate from run history and cron runtime state.

#### Scenario: Bot persists the start of an outage window
- **WHEN** a bot transitions from `connected` into `reconnecting` or `disconnected`
- **THEN** the system records `last_disconnected_at` as the start of the current outage window
- **AND** it does not overwrite that timestamp on subsequent retry churn inside the same outage window

#### Scenario: Bot persists reconnect notification bookkeeping
- **WHEN** a bot sends a `service_reconnected` notification after recovering from an outage window
- **THEN** the system updates the persisted bot connection-event state with the reconnect time and the last reconnect notification time

#### Scenario: Service-online notification is session-scoped rather than permanently deduplicated
- **WHEN** a bot process restarts and the bot reaches its first successful `connected` state in the new process session
- **THEN** the system may emit a new `service_online` notification even if it emitted one in a prior process session
- **AND** this session-scoped dedup is tracked in process memory rather than as a permanent bot-history flag

### Requirement: WebSocket connection transitions can emit service event notifications
The system SHALL interpret bot WebSocket state transitions as service event triggers and emit notifications only when the transition semantics match the configured service event rules.

#### Scenario: Recovery after configured long outage emits service_reconnected
- **WHEN** a bot runtime has a persisted outage window start time
- **AND** its WebSocket health transitions back into `connected`
- **AND** the outage duration is at least the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system emits one `service_reconnected` event notification for that outage window

#### Scenario: Recovery below configured threshold does not emit service_reconnected
- **WHEN** a bot runtime transitions back into `connected`
- **AND** the elapsed time since `last_disconnected_at` is less than the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system does not emit `service_reconnected`

#### Scenario: Reconnect threshold defaults to ten minutes
- **WHEN** the operator does not configure `server.service_reconnect_notification_threshold_ms`
- **THEN** the system uses a default reconnect notification threshold of `600000` milliseconds
