## MODIFIED Requirements

### Requirement: `kfc` is the controlled local execution and lifecycle interface
The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, controlled direct task execution, and local health inspection.

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

#### Scenario: Local admin uninstalls the service
- **WHEN** a local administrator executes `kfc service uninstall`
- **THEN** the system stops the managed service first if it is running
- **AND** it unloads every launchd-managed cronjob derived from the installed config for every configured bot
- **AND** it removes each cronjob plist file used by those bot-scoped cronjobs
- **AND** it removes `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it cancels launchd management for the main service

#### Scenario: Cronjob uninstall continues across multiple tasks
- **WHEN** `kfc service uninstall` needs to unload multiple configured cronjob launchd jobs
- **THEN** it attempts cleanup for each configured cronjob rather than stopping after the first one

#### Scenario: Cronjob cleanup failure is surfaced
- **WHEN** `kfc service uninstall` cannot unload or remove one of the configured cronjob launchd jobs
- **THEN** the system reports a clear operator-facing uninstall error or warning that identifies the affected cronjob
- **AND** it still attempts cleanup for the remaining configured cronjobs

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

#### Scenario: Health is available through HTTP, CLI, and Feishu command surfaces
- **WHEN** the running service publishes health data
- **THEN** HTTP `/health`, `kfc health`, and the authorized Feishu `/health` command all expose the same canonical bot list, readiness flag, and per-bot WebSocket state model

#### Scenario: Service shutdown closes WebSocket without replacement
- **WHEN** the process is intentionally stopping and closes a bot's WebSocket client as part of shutdown
- **THEN** the system does not attempt to establish a replacement long connection for that stopping process

#### Scenario: Reload closes old runtime but starts replacement connection
- **WHEN** the system reloads configuration and intentionally closes the old runtime for an existing bot or a replaced bot definition
- **THEN** it starts the newly active runtime's WebSocket client for that bot before considering event ingress restored
- **AND** it does not rely on the closed runtime's internal reconnect loop to recover ingress
