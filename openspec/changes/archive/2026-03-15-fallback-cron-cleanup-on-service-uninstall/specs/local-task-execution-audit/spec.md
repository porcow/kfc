## MODIFIED Requirements

### Requirement: Local admin lifecycle management via CLI
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
- **WHEN** a local administrator executes `kfc service start`, `kfc service restart`, or `kfc service stop`
- **AND** the service plist is not installed
- **THEN** the system returns a clear operator-facing error that explains the service is not installed

