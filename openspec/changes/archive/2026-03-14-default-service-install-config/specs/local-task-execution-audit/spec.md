## MODIFIED Requirements

### Requirement: `kfc` is the controlled local execution and lifecycle interface
The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, and controlled direct task execution.

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
- **AND** it removes `~/Library/LaunchAgents/com.kidsalfred.service.plist`
- **AND** it cancels launchd management for the main service

#### Scenario: Local admin stops the service
- **WHEN** a local administrator executes `kfc service stop`
- **THEN** the system stops the main service process without rewriting configured cronjob policy

#### Scenario: Start, restart, or stop on an uninstalled service returns a clear error
- **WHEN** a local administrator executes `kfc service start`, `kfc service restart`, or `kfc service stop` before the main-service plist has been installed
- **THEN** the system returns a clear operator-facing error describing that the service is not installed
- **AND** it does not silently succeed

#### Scenario: Local admin executes a configured task directly
- **WHEN** a local administrator executes `kfc exec --bot BOT_ID --task TASK_ID`
- **THEN** the system runs that configured task directly on the host without requiring Feishu confirmation
- **AND** it rejects unknown tasks or bots
