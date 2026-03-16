## MODIFIED Requirements

### Requirement: Local admin lifecycle management via CLI
The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, controlled direct task execution, local health inspection, full user-local uninstall, GitHub-Release-based self-update, and single-step rollback to the previous locally installed version.

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

#### Scenario: Local admin installs from a GitHub Release artifact
- **WHEN** the host install flow installs the app into `~/.local/share/kfc/app` from a GitHub Release tarball
- **THEN** the system reads release metadata embedded in the extracted release asset
- **AND** it persists install metadata outside the app directory
- **AND** that metadata records the installed release version and the immediately previous locally installed version when present

#### Scenario: Embedded release metadata drives install version recording
- **WHEN** the host install flow finishes extracting a GitHub Release tarball
- **THEN** the system reads an embedded release metadata file from the extracted app contents
- **AND** it uses that embedded release metadata as the source of truth for the installed release version written to local install metadata

#### Scenario: Embedded release metadata has the required artifact identity fields
- **WHEN** the host install flow or update flow reads embedded release metadata from an extracted release asset
- **THEN** that embedded metadata includes `repo`, `version`, `channel`, `published_at`, and `asset_name`
- **AND** the install or update is blocked if any of those required fields are missing or invalid

#### Scenario: Local install metadata has the required deployment state fields
- **WHEN** the host install flow, update flow, or rollback flow writes local install metadata outside the app directory
- **THEN** that metadata includes `install_source`, `repo`, `channel`, `current_version`, `previous_version`, `installed_at`, and `previous_installed_at`
- **AND** first install may write `null` for `previous_version` and `previous_installed_at`

#### Scenario: Local admin runs `kfc update` and no newer release exists
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service determines that the installed release version matches the latest supported GitHub Release
- **THEN** the CLI reports that the service is already on the latest version
- **AND** it does not download a new asset or rerun installation

#### Scenario: Release update inspection only considers the latest stable release
- **WHEN** `kfc update` inspects the remote release source
- **THEN** it evaluates only the latest stable GitHub Release
- **AND** it excludes draft and prerelease releases from update availability decisions

#### Scenario: Local admin confirms an available release update
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service detects a newer supported GitHub Release
- **AND** the administrator confirms the update prompt
- **THEN** the system downloads the release asset into a staging location
- **AND** it installs the staged app into `app.new`
- **AND** it moves the previous active app into `app.previous`
- **AND** it activates the newly staged app as `app`
- **AND** it refreshes the deployed service using `kfc service install` semantics
- **AND** it reports that the update completed along with the current version information

#### Scenario: Successful update always overwrites the rollback target
- **WHEN** a release update completes successfully
- **THEN** the system stores the pre-update active app as `app.previous`
- **AND** any older rollback candidate is replaced

#### Scenario: Release update rewrites install metadata from the staged asset
- **WHEN** a release update stages a newer release into `app.new`
- **THEN** the system reads release metadata embedded in the staged app contents
- **AND** it writes that version as the new current version in local install metadata after activation
- **AND** it records the previously active version as the new rollback candidate

#### Scenario: Local admin skips update confirmation explicitly
- **WHEN** a local administrator executes `kfc update --yes`
- **AND** the local service detects a newer supported GitHub Release
- **THEN** the system skips the local confirmation prompt
- **AND** it still performs the same release inspection, staging, verification, and service refresh workflow as interactive `kfc update`

#### Scenario: Local admin declines an available release update
- **WHEN** a local administrator executes `kfc update`
- **AND** the local service detects a newer supported GitHub Release
- **AND** the administrator answers anything other than `y` or `yes`
- **THEN** the system aborts the update without modifying the installed app or refreshing the service

#### Scenario: Release-based self-update is blocked when install metadata is unusable
- **WHEN** `kfc update` is executed on an install that lacks usable release install metadata, lacks a resolvable release source, or cannot determine the current installed version
- **THEN** the system returns a clear operator-facing error
- **AND** it does not attempt to download or install a new release

#### Scenario: Release-based self-update is blocked when release lookup or staging fails
- **WHEN** `kfc update` cannot query the latest supported release, cannot download the release asset, cannot extract it, cannot install dependencies, or cannot verify the staged app
- **THEN** the system returns a clear operator-facing error
- **AND** it leaves the currently active install unchanged

#### Scenario: Update failure after swap reports successful automatic restore
- **WHEN** `kfc update` has already activated the staged app
- **AND** the subsequent service refresh fails
- **AND** the system successfully restores the previous local install automatically
- **THEN** the CLI returns a clear operator-facing error stating that the update failed
- **AND** it explicitly states that the service was rolled back to the restored previous version

#### Scenario: Update failure after swap reports failed automatic restore
- **WHEN** `kfc update` has already activated the staged app
- **AND** the subsequent service refresh fails
- **AND** the system cannot restore the previous local install automatically
- **THEN** the CLI returns a clear operator-facing error stating that both update and automatic rollback failed
- **AND** it instructs the operator that manual recovery is required

#### Scenario: Rollback failure after swap attempts automatic restoration
- **WHEN** `kfc rollback` has already started swapping `app` and `app.previous`
- **AND** the subsequent validation or service refresh fails
- **THEN** the system attempts to restore the last known runnable directory layout automatically
- **AND** it restores local install metadata to match the recovered runnable state when that automatic restoration succeeds

#### Scenario: Local admin rolls back to the previous locally installed version
- **WHEN** a local administrator executes `kfc rollback`
- **AND** a previous locally installed app version is available as `app.previous`
- **AND** the administrator confirms the rollback prompt
- **THEN** the system swaps `app` and `app.previous`
- **AND** it refreshes the deployed service using `kfc service install` semantics
- **AND** it reports that the rollback completed along with the current version information

#### Scenario: Rollback keeps the rolled-back-from version as the next rollback candidate
- **WHEN** a rollback completes successfully
- **THEN** the version that was active before rollback becomes the new `app.previous`

#### Scenario: Rollback rewrites install metadata after swapping app directories
- **WHEN** a rollback completes successfully
- **THEN** the system rewrites local install metadata so `current_version` and `previous_version` reflect the swapped `app` and `app.previous` directories

#### Scenario: Local admin skips rollback confirmation explicitly
- **WHEN** a local administrator executes `kfc rollback --yes`
- **AND** a previous locally installed app version is available
- **THEN** the system skips the local confirmation prompt
- **AND** it still performs the same rollback validation and service refresh workflow as interactive `kfc rollback`

#### Scenario: Local admin declines an available rollback
- **WHEN** a local administrator executes `kfc rollback`
- **AND** the local service detects that `app.previous` is available
- **AND** the administrator answers anything other than `y` or `yes`
- **THEN** the system aborts rollback without modifying the installed app or refreshing the service

#### Scenario: Rollback is blocked when no previous locally installed version exists
- **WHEN** a local administrator executes `kfc rollback`
- **AND** the install does not have a usable `app.previous` rollback target and matching metadata
- **THEN** the system returns a clear operator-facing error that no rollback version is available

#### Scenario: Rollback failure leaves a recoverable install state
- **WHEN** rollback validation or service refresh fails after filesystem swapping has begun
- **THEN** the system attempts to restore a runnable app directory
- **AND** it returns a clear operator-facing error describing the rollback failure
