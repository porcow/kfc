## Purpose
Define the local execution, persistence, audit, lifecycle, and service-management behavior that must remain durable and operator-auditable across runs and restarts.
## Requirements
### Requirement: Bot WebSocket health and effective ingress availability are observable
The system SHALL expose bot-scoped ingress health so operators can distinguish process availability, primary WebSocket transport health, recent WebSocket ingress observations, and effective bot serviceability.

#### Scenario: Canonical health uses per-bot WebSocket diagnostics only
- **WHEN** the running service publishes health data
- **THEN** the canonical health JSON exposes WebSocket diagnostics under `botHealth.<id>.websocket`
- **AND** it does not duplicate those same diagnostics in a top-level `websocket` map

#### Scenario: WebSocket state is transport-diagnostic rather than serviceability verdict
- **WHEN** the health surface exposes `botHealth.<id>.websocket.state`
- **THEN** that field represents inferred long-connection transport lifecycle state
- **AND** effective serviceability is still determined by `botHealth.<id>.availability`

#### Scenario: Reconnection success updates transport state
- **WHEN** the Feishu SDK emits connection-success or reconnect-success lifecycle signals for a bot's long connection
- **THEN** the service updates `botHealth.<id>.websocket.state` to `connected`
- **AND** it does not remain stuck in `reconnecting` solely because reconnect success was observed only through connection-level debug signals

#### Scenario: Non-connection debug traffic does not become operator-visible by default
- **WHEN** the service enables the Feishu SDK debug stream needed to infer connection lifecycle state
- **THEN** it may still filter or suppress non-connection debug logs from operator-visible output
- **AND** it does not rely on dumping all SDK debug payload logs to preserve `websocket.state`

#### Scenario: Development mode retains full SDK debug visibility
- **WHEN** the service runs in development mode while consuming Feishu SDK debug signals for connection-state inference
- **THEN** local debugging still has access to the full SDK debug stream, including payload-oriented event logs
- **AND** this development visibility does not change the canonical meaning of `websocket.state`

#### Scenario: Health no longer exposes degraded as a separate verdict
- **WHEN** the running service publishes health data
- **THEN** the canonical health model does not include a separate `degraded` field
- **AND** operators derive nuance from availability plus WebSocket transport diagnostics instead

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

#### Scenario: Bot explicitly configures `shell`
- **WHEN** a bot declares task `shell`
- **THEN** the system accepts it only if it remains bound to `runner_kind = "builtin-tool"`, `execution_mode = "oneshot"`, and `tool = "shell-script"`

#### Scenario: Bot explicitly configures `osascript`
- **WHEN** a bot declares task `osascript`
- **THEN** the system accepts it only if it remains bound to `runner_kind = "builtin-tool"`, `execution_mode = "oneshot"`, and `tool = "osascript-script"`

#### Scenario: Confirmed shell execution runs the submitted script body
- **WHEN** an authorized Feishu `/shell` request is confirmed for a bot that exposes task `shell`
- **THEN** the system materializes the submitted shell script body to a temporary file under the bot working directory
- **AND** it executes that file locally through the controlled built-in tool boundary

#### Scenario: Confirmed osascript execution runs the submitted script body
- **WHEN** an authorized Feishu `/osascript` request is confirmed for a bot that exposes task `osascript`
- **THEN** the system materializes the submitted AppleScript body to a temporary file under the bot working directory
- **AND** it executes that file locally through the controlled built-in tool boundary

#### Scenario: Ad hoc script runs remain auditable like other one-shot tasks
- **WHEN** a confirmed `/shell` or `/osascript` request creates a run
- **THEN** the run is persisted through the same one-shot audit path used by other built-in tasks
- **AND** `/run-status <run_id>` returns the canonical persisted state and summary for that execution

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

#### Scenario: Self-update survives bootout of the old service job tree
- **WHEN** a self-update operation reaches the phase that refreshes `com.kidsalfred.service`
- **THEN** the critical refresh execution runs outside the launchd job tree being booted out
- **AND** booting out the old main-service job does not terminate the in-flight update operation before it can finish the refresh handoff

#### Scenario: Self-rollback survives bootout of the old service job tree
- **WHEN** a self-rollback operation reaches the phase that refreshes `com.kidsalfred.service`
- **THEN** the critical refresh execution runs outside the launchd job tree being booted out
- **AND** booting out the old main-service job does not terminate the in-flight rollback operation before it can finish the refresh handoff

#### Scenario: Update handoff remains auditable across service replacement
- **WHEN** the old service instance hands off a self-update operation before booting itself out
- **THEN** the system persists durable handoff state describing the in-progress operation
- **AND** a later operator status query can reconcile that operation to a canonical terminal outcome after the new service instance starts

#### Scenario: Rollback handoff remains auditable across service replacement
- **WHEN** the old service instance hands off a self-rollback operation before booting itself out
- **THEN** the system persists durable handoff state describing the in-progress operation
- **AND** a later operator status query can reconcile that operation to a canonical terminal outcome after the new service instance starts

#### Scenario: Shared self-update workflow remains consistent across Feishu and CLI entrypoints
- **WHEN** `/server update` and `kfc update` invoke the shared self-update workflow
- **THEN** they use the same inspection and detached execution semantics
- **AND** they do not diverge into separate refresh implementations based on the caller

#### Scenario: Shared self-rollback workflow remains consistent across Feishu and CLI entrypoints
- **WHEN** `/server rollback` and `kfc rollback` invoke the shared self-rollback workflow
- **THEN** they use the same rollback inspection and detached execution semantics
- **AND** they do not diverge into separate refresh implementations based on the caller

#### Scenario: Self-refresh helper is one-shot
- **WHEN** the system schedules a detached helper for self-update or self-rollback
- **THEN** the helper launchd job has a unique label for that operation
- **AND** it runs at load without keepalive or recurring schedule semantics
- **AND** it cleans up its own launchd job registration and plist after reaching a terminal state

#### Scenario: Refresh operation ownership is claimed exactly once
- **WHEN** a helper starts for a persisted self-refresh operation
- **THEN** it atomically claims ownership of that operation before running the refresh
- **AND** any later duplicate helper start for the same operation exits without executing a second refresh

#### Scenario: Helper launch requires completed handoff preparation
- **WHEN** the old service is about to schedule a self-refresh helper
- **THEN** the operation has already passed inspection and operator confirmation
- **AND** any linked run record has already been persisted
- **AND** the `service_refresh_operations` record already exists in `prepared`
- **AND** the helper is not considered handed off until both helper `bootstrap` and `kickstart` succeed

#### Scenario: No refresh-side effects occur before helper scheduling succeeds
- **WHEN** helper scheduling has not yet completed successfully
- **THEN** the old service does not swap app directories, write new install metadata, or boot out `com.kidsalfred.service`
- **AND** failure before successful helper scheduling leaves the currently running service version in place

#### Scenario: Startup reconciliation converges unfinished refresh operations
- **WHEN** the service starts and finds self-refresh operations left in `prepared`, `helper_bootstrapped`, or `refreshing`
- **THEN** it reconciles them against durable host state and install metadata
- **AND** it updates the operation record and any linked run record to a canonical terminal outcome before relying on them for operator-facing status

#### Scenario: Refresh failure restores the previous serviceable version when possible
- **WHEN** a self-update or self-rollback helper fails after crossing into the managed-service refresh boundary
- **THEN** it attempts automatic restoration of the previous known-good app version before settling terminal state
- **AND** if restoration succeeds, it records the operation as `restored_previous_version`
- **AND** it leaves the host running a serviceable version of the service

#### Scenario: Manual recovery is reserved for unrecoverable refresh failures
- **WHEN** a self-update or self-rollback helper fails during refresh and automatic restoration also fails
- **THEN** it records the operation as `manual_recovery_required`
- **AND** the durable summary explicitly says that automatic restoration failed and manual recovery is required

#### Scenario: Feishu completion follows restored service availability
- **WHEN** a self-update fails during refresh but automatic restoration succeeds
- **THEN** the restored service instance reconciles the durable operation state after startup
- **AND** any Feishu-facing terminal completion reports that the update failed, automatic restoration succeeded, and the current running version is the restored version

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
The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, controlled direct task execution, local health inspection, full user-local uninstall, release-based self-update, and single-step rollback to the previous locally installed version.

#### Scenario: Local admin installs and starts the service with an explicit config path
- **WHEN** a local administrator executes `kfc service install --config /path/to/bot.toml`
- **THEN** the system writes or refreshes the main-service plist at `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it installs launchd management for the main service under the stable label `com.kidsalfred.service`
- **AND** it removes cron launchd jobs deleted from the previously installed config before starting the refreshed main service
- **AND** it starts the main service immediately
- **AND** installation triggers configuration validation and cronjob reconciliation

#### Scenario: Local admin installs and starts the service with the default config path
- **WHEN** a local administrator executes `kfc service install` without `--config`
- **THEN** the system resolves the service config path to `~/.config/kfc/config.toml`
- **AND** it writes or refreshes the main-service plist at `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it installs launchd management for the main service under the stable label `com.kidsalfred.service`
- **AND** it removes cron launchd jobs deleted from the previously installed config before starting the refreshed main service
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

#### Scenario: Local admin performs a full uninstall through the CLI and preserves config by default
- **WHEN** a local administrator executes `kfc uninstall`
- **THEN** the system presents a destructive-action confirmation prompt before removing files
- **AND** the prompt clearly states that the default config file will be preserved unless config deletion was explicitly requested
- **AND** after confirmation it removes launchd state, installed app files, the local launcher, and the work directory
- **AND** it preserves the default config file at `~/.config/kfc/config.toml`

#### Scenario: Local admin opts in to deleting config during full uninstall
- **WHEN** a local administrator executes `kfc uninstall --delete-config`
- **THEN** the system presents a destructive-action confirmation prompt before removing files
- **AND** the prompt clearly states that the default config file will also be removed
- **AND** after confirmation it removes launchd state, installed app files, the local launcher, the work directory, and the default config file at `~/.config/kfc/config.toml`

#### Scenario: Local admin declines full uninstall confirmation
- **WHEN** a local administrator executes `kfc uninstall`
- **AND** responds with anything other than `y` or `yes`
- **THEN** the system aborts full uninstall without removing files or launchd state

#### Scenario: Non-interactive full uninstall preserves config by default
- **WHEN** a local administrator executes `kfc uninstall --yes`
- **THEN** the system skips the confirmation prompt
- **AND** it removes launchd state, installed app files, the local launcher, and the work directory
- **AND** it preserves the default config file at `~/.config/kfc/config.toml`

#### Scenario: Non-interactive full uninstall deletes config when explicitly requested
- **WHEN** a local administrator executes `kfc uninstall --yes --delete-config`
- **THEN** the system skips the confirmation prompt
- **AND** it removes launchd state, installed app files, the local launcher, the work directory, and the default config file at `~/.config/kfc/config.toml`

#### Scenario: Local admin runs `kfc update` and no newer stable release exists
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service determines that no newer supported GitHub Release is available
- **THEN** the CLI reports that the service is already on the latest version
- **AND** it does not download or reinstall a release asset

#### Scenario: Local admin confirms an available release update
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service detects that a newer latest stable GitHub Release exists
- **AND** the administrator confirms the update prompt
- **THEN** the system stages the new release under `app.new`
- **AND** it verifies the embedded release metadata before activation
- **AND** it refreshes the deployed service using `kfc service install` semantics
- **AND** it reports that the update completed along with the current version information

#### Scenario: Local admin skips confirmation explicitly
- **WHEN** a local administrator executes `kfc update --yes`
- **AND** the local service detects that a newer latest stable GitHub Release exists
- **THEN** the system skips the local confirmation prompt
- **AND** it still performs the same metadata validation and release-update workflow as interactive `kfc update`

#### Scenario: Local admin declines an available update
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service detects that a newer latest stable GitHub Release exists
- **AND** the administrator answers anything other than `y` or `yes`
- **THEN** the system aborts the update without modifying the active app or reinstalling the service

#### Scenario: Release update is blocked when install metadata is unusable
- **WHEN** `kfc update` cannot read valid local install metadata for a release-based install
- **THEN** the system returns a clear operator-facing error
- **AND** it does not attempt to download or activate a release asset

#### Scenario: Release update checks only the latest stable release
- **WHEN** `kfc update` inspects remote release availability
- **THEN** it uses only the latest stable GitHub Release for update comparison
- **AND** it excludes draft and prerelease releases from update availability decisions

#### Scenario: Old installs without release metadata are blocked from update and rollback
- **WHEN** a locally installed app lacks usable `install-metadata.json`
- **THEN** `kfc update` and `kfc rollback` are blocked
- **AND** the operator-facing error directs the user to reinstall through the release-based installer to enable lifecycle management

#### Scenario: Update failure after activation reports successful automatic rollback
- **WHEN** `kfc update` has already activated a staged release
- **AND** the subsequent service refresh fails
- **AND** the system successfully restores the previous local install automatically
- **THEN** the CLI reports that the update failed
- **AND** it explicitly states that the service was rolled back to the restored previous version

#### Scenario: Update failure after activation reports failed automatic rollback
- **WHEN** `kfc update` has already activated a staged release
- **AND** the subsequent service refresh fails
- **AND** the system cannot restore the previous local install automatically
- **THEN** the CLI reports that both update and automatic rollback failed
- **AND** it explicitly states that manual recovery is required

#### Scenario: Local admin runs `kfc rollback` when no previous version exists
- **WHEN** a local administrator executes `kfc rollback`
- **AND** no previous locally installed version is available
- **THEN** the CLI returns a clear operator-facing error that no rollback version is available

#### Scenario: Local admin confirms an available rollback
- **WHEN** a local administrator executes `kfc rollback`
- **AND** a previous locally installed version is available
- **AND** the administrator confirms the rollback prompt
- **THEN** the system swaps `app` and `app.previous`
- **AND** it refreshes the deployed service using `kfc service install` semantics
- **AND** it reports that the rollback completed along with the current version information

#### Scenario: Local admin skips rollback confirmation explicitly
- **WHEN** a local administrator executes `kfc rollback --yes`
- **AND** a previous locally installed version is available
- **THEN** the system skips the local confirmation prompt
- **AND** it still performs the same rollback validation and service-refresh workflow as interactive `kfc rollback`

#### Scenario: Rollback failure reports automatic restore status
- **WHEN** `kfc rollback` has already started swapping `app` and `app.previous`
- **AND** the subsequent validation or service refresh fails
- **THEN** the CLI reports which rollback step failed
- **AND** it states whether the service was automatically restored to the last known runnable version or whether manual recovery is required

#### Scenario: Local admin stops the service
- **WHEN** a local administrator executes `kfc service stop`
- **THEN** the system stops the main service process without rewriting configured cronjob policy
- **AND** it does not delete the main service plist, unload configured cron launchd jobs, or remove cron plist files

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

#### Scenario: Host uninstall flow preserves config by default
- **WHEN** an operator executes `uninstall.sh` without an explicit config-deletion opt-in
- **THEN** the uninstall flow removes launchd state, installed app files, the local launcher, and the work directory
- **AND** it preserves the default config file at `~/.config/kfc/config.toml`

#### Scenario: Host uninstall flow deletes config only when explicitly requested
- **WHEN** an operator executes `uninstall.sh` with `KFC_DELETE_CONFIG=true`
- **THEN** the uninstall flow removes launchd state, installed app files, the local launcher, the work directory, and the default config file at `~/.config/kfc/config.toml`

### Requirement: Service startup and reload reconcile launchd-managed cronjobs
The system SHALL reconcile configured cronjob tasks against `launchctl` state on startup and reload.

#### Scenario: Service install removes cron jobs deleted from config
- **WHEN** a local administrator executes `kfc service install` for a config that no longer declares one or more cron tasks present under the previously installed service config
- **THEN** the system unloads those deleted cron launchd jobs and removes their cron plist files before starting the refreshed main service
- **AND** it keeps cron jobs that are still declared available for the normal post-start reconcile flow

#### Scenario: Release update refresh cleans deleted cron jobs
- **WHEN** `kfc update` completes activation of a new release
- **THEN** the service refresh step removes cron launchd jobs deleted from the active config in addition to refreshing the main service plist
- **AND** the host launchd state after the refresh matches the currently active config rather than retaining deleted cron jobs

#### Scenario: Release rollback refresh cleans deleted cron jobs
- **WHEN** `kfc rollback` completes activation of the rollback target
- **THEN** the service refresh step removes cron launchd jobs deleted from the active config in addition to refreshing the main service plist
- **AND** the host launchd state after the refresh matches the currently active config rather than retaining deleted cron jobs

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

### Requirement: The repository SHALL use Bun for dependency installation while keeping Node as the installed-service runtime
The system SHALL treat Bun as the supported package manager for installing dependencies and SHALL also use Bun as the formal runtime for the installed launcher, managed main service, and launchd-managed cronjobs.

#### Scenario: Host installation resolves dependencies and runtime through Bun
- **WHEN** an operator installs the project through the supported host installer
- **THEN** the installer uses Bun to install project dependencies into the extracted app directory
- **AND** it prepares the installed launcher so it executes the app through Bun rather than Node

#### Scenario: Managed service launchd plist uses Bun runtime
- **WHEN** a local administrator executes `kfc service install`
- **THEN** the generated `~/Library/LaunchAgents/com.kidsalfred.service.plist` invokes Bun directly for the service entrypoint
- **AND** it does not require `node --experimental-strip-types`

#### Scenario: Managed cronjob launchd plist uses Bun runtime
- **WHEN** the system writes a launchd plist for a configured cronjob task
- **THEN** the generated plist invokes Bun directly for the `kfc exec` entrypoint
- **AND** it does not require `node --experimental-strip-types`

#### Scenario: Release update refreshes the installed service under Bun runtime semantics
- **WHEN** a release-based update completes successfully
- **THEN** the refreshed installed launcher and managed service continue to be generated with Bun runtime program arguments

#### Scenario: Release rollback refreshes the installed service under Bun runtime semantics
- **WHEN** a release-based rollback completes successfully
- **THEN** the restored installed launcher and managed service continue to be generated with Bun runtime program arguments

### Requirement: Repository-local runtime SHALL support a Bun-compatible execution path
The repository SHALL provide a Bun-compatible local execution path for service entrypoints without requiring the local runtime to import `node:sqlite` directly.

#### Scenario: Local Bun start does not depend on `node:sqlite`
- **WHEN** an operator runs the repository-local service entrypoint through Bun
- **THEN** the service startup path uses a persistence implementation that is compatible with Bun
- **AND** it does not fail solely because `node:sqlite` is unavailable in Bun

#### Scenario: Node local execution remains supported during Bun compatibility migration
- **WHEN** an operator runs the repository-local service entrypoint through Node
- **THEN** the existing Node-compatible runtime path continues to function
- **AND** the Bun compatibility work does not remove the stable Node execution path during migration

### Requirement: Repository test execution SHALL support direct Bun test runner usage
The repository SHALL support direct `bun test` as a first-class local test execution path for the supported test suite.

#### Scenario: Direct Bun test passes for the supported suite
- **WHEN** an operator runs `bun test` from the repository root
- **THEN** the supported repository test suite executes successfully under Bun
- **AND** the migration does not rely on delegating test execution back to Node's built-in runner

#### Scenario: Bun test migration avoids brittle runtime-specific assertions
- **WHEN** a test currently depends on Node-specific timing, ordering, or formatting side effects
- **THEN** the migration rewrites the assertion to check the intended behavior instead
- **AND** the resulting test remains deterministic under Bun

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

#### Scenario: Allowlisted user receives default power event subscriptions
- **WHEN** a bot starts or reloads configuration with an `allowed_users` entry not yet present in service event subscriptions
- **THEN** the system creates enabled default subscriptions for that actor for `system_sleeping` and `system_woke`

#### Scenario: Diagnostic reconnect subscription is not auto-enabled by default
- **WHEN** a bot starts or reloads configuration with an `allowed_users` entry not yet present in service event subscriptions
- **THEN** the system does not automatically enable `service_reconnected` for that actor
- **AND** `service_reconnected` remains available as an optional diagnostic subscription

#### Scenario: Removed allowlisted user loses service event subscriptions
- **WHEN** a bot reloads configuration and an actor is no longer present in that bot's `allowed_users`
- **THEN** the system removes or disables that actor's persisted service event subscriptions for that bot

#### Scenario: Service event subscriptions remain bot-scoped
- **WHEN** multiple bots are loaded in the same process
- **THEN** each bot persists and resolves its own service event subscriptions independently by `bot_id`

### Requirement: Bot connection event state is persisted independently from run and cron state
The system SHALL persist service connection-event state per bot so online-session and heartbeat-based reconnect detection survive process restarts and remain separate from run history and cron runtime state.

#### Scenario: Bot persists successful heartbeat timestamps
- **WHEN** a bot heartbeat evaluator confirms that effective WebSocket availability is currently recovered
- **THEN** the system records the current heartbeat success timestamp in persisted service-event state
- **AND** that timestamp becomes the prior-success reference for the next reconnect evaluation

#### Scenario: Bot persists reconnect notification bookkeeping
- **WHEN** a bot sends a `service_reconnected` notification after a successful heartbeat gap exceeds the reconnect threshold
- **THEN** the system updates the persisted bot connection-event state with the current heartbeat success time and the last reconnect notification time

#### Scenario: Service event state reuses the bot sqlite store
- **WHEN** a bot runtime persists service connection-event state
- **THEN** it stores that state in the same bot-scoped sqlite database used for run history and cron metadata
- **AND** it keeps service-event state logically separate from run records and cron records

#### Scenario: Service event state can be created on an otherwise empty sqlite store
- **WHEN** a bot runtime needs to persist service connection-event state before any runs or cron state exist
- **THEN** the system may create a fresh sqlite database using only the heartbeat-based service-event state schema
- **AND** later run and cron tables remain compatible with that database

### Requirement: WebSocket connection transitions can emit service event notifications
The system SHALL emit power-event notifications for sleep and wake, SHALL keep `service_online` as the first successful connected event in a process session, and SHALL keep `service_reconnected` as a diagnostic availability-recovery event.

#### Scenario: Observed sleep attempts a best-effort system_sleeping notification
- **WHEN** the service observes that the host is entering sleep while it still has a runnable window
- **THEN** the system attempts to emit one `system_sleeping` service event notification
- **AND** failure to deliver that notification does not prevent later wake or reconnect notifications

#### Scenario: Observed wake is deferred until availability is restored
- **WHEN** the service observes a host wake event
- **THEN** it records a pending wake notification for that bot runtime
- **AND** it does not require immediate Feishu sendability at the same instant as the wake observation

#### Scenario: Restored availability emits system_woke after a recorded wake
- **WHEN** a pending wake notification exists for the bot
- **AND** effective service availability becomes true after that wake
- **THEN** the system emits one `system_woke` notification as soon as it can deliver it
- **AND** it clears the pending wake notification after successful handling

#### Scenario: First connected transition emits service_online once per session
- **WHEN** a bot transitions into `connected` for the first time in the current service process session
- **THEN** the system emits one `service_online` event notification
- **AND** later transitions to `connected` in the same process session do not emit another `service_online`

#### Scenario: Startup baseline evaluation does not emit service_reconnected
- **WHEN** the service performs the immediate startup heartbeat-style evaluation for a bot
- **AND** no prior successful heartbeat timestamp exists yet for that bot
- **THEN** the system records the successful heartbeat baseline when effective availability is present
- **AND** it does not emit `service_reconnected`

#### Scenario: Large heartbeat-success gap emits service_reconnected
- **WHEN** the bot reconnect evaluator runs while effective WebSocket availability is currently present
- **AND** a prior successful heartbeat timestamp exists
- **AND** the elapsed time between the current successful heartbeat and the prior successful heartbeat is at least the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system emits one `service_reconnected` event notification
- **AND** that event remains part of the diagnostic service-event model even when it is not default-subscribed

#### Scenario: Availability recovery triggers immediate reconnect evaluation
- **WHEN** effective WebSocket availability transitions from unavailable to available because transport recovery or a new WebSocket ingress observation restores serviceability
- **THEN** the system performs an immediate reconnect evaluation using the same persistence path and threshold logic as the periodic heartbeat evaluator
- **AND** it does not wait solely for the next periodic heartbeat tick

#### Scenario: Small heartbeat-success gap does not emit service_reconnected
- **WHEN** the bot reconnect evaluator runs while effective WebSocket availability is currently present
- **AND** a prior successful heartbeat timestamp exists
- **AND** the elapsed time between the current successful heartbeat and the prior successful heartbeat is less than the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system does not emit `service_reconnected`

#### Scenario: Reconnect evaluator still has a periodic safety-net tick
- **WHEN** no explicit recovery edge is observed for a bot but the periodic heartbeat timer fires
- **THEN** the system still evaluates reconnect state through the same heartbeat-success path
- **AND** periodic evaluation remains a fallback rather than the only reconnect trigger

#### Scenario: Default reconnect notification threshold remains one hour
- **WHEN** the operator does not configure `server.service_reconnect_notification_threshold_ms`
- **THEN** the system uses a default reconnect notification threshold of `3600000` milliseconds

### Requirement: Bun is the only supported local runtime prerequisite
The system SHALL treat Bun as the only supported runtime prerequisite for repository-local execution, installed lifecycle flows, sqlite-backed persistence, and test execution.

#### Scenario: Repository-local wrapper executes through Bun
- **WHEN** an operator invokes the repository-local `./kfc` wrapper
- **THEN** the wrapper executes through Bun rather than Node
- **AND** it does not require `node --experimental-strip-types`

#### Scenario: Installation lifecycle does not require Node
- **WHEN** an operator runs `install.sh`
- **THEN** the script does not require a Node executable to parse release metadata or write install metadata
- **AND** Bun remains sufficient for installation and later lifecycle flows

#### Scenario: SQLite persistence uses only the Bun runtime backend
- **WHEN** the service, CLI, or tests open the sqlite-backed run store
- **THEN** the system uses the Bun sqlite backend
- **AND** it does not retain a supported `node:sqlite` runtime branch

#### Scenario: Bun is the only supported test runner
- **WHEN** repository tests are executed through the supported path
- **THEN** they run through Bun
- **AND** the project does not claim Node test runner support

### Requirement: GitHub Release artifacts are packaged through a canonical workflow
The project SHALL provide a repeatable release packaging workflow that produces the GitHub Release tarball consumed by host install and release-based update flows.

#### Scenario: Version tag produces the canonical tarball asset
- **WHEN** a maintainer publishes a supported version tag
- **THEN** the release workflow produces a tarball named `kfc-vX.Y.Z.tar.gz`
- **AND** it publishes that tarball as the canonical GitHub Release asset for the tag

#### Scenario: Embedded release metadata is generated during packaging
- **WHEN** the release workflow stages the runtime app contents
- **THEN** it generates `.kfc-release.json` inside the packaged app root
- **AND** that metadata includes `repo`, `version`, `channel`, `published_at`, and `asset_name`

#### Scenario: Tarball content is verified before publication
- **WHEN** the release workflow prepares the canonical tarball
- **THEN** it verifies the asset contains `.kfc-release.json`
- **AND** it verifies required runtime entrypoints such as `src/index.ts`, `src/kfc.ts`, and `package.json`
- **AND** it verifies the embedded `asset_name` matches the tarball filename
