## MODIFIED Requirements

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
