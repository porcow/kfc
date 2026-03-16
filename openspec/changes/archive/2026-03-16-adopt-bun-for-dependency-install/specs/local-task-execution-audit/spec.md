## ADDED Requirements

### Requirement: The repository SHALL use Bun for dependency installation while keeping Node as the runtime
The system SHALL treat Bun as the supported package manager for installing dependencies and maintaining the repository lockfile, while continuing to execute service, development, test, and launchd entrypoints with Node.js.

#### Scenario: Developer installs dependencies for local work
- **WHEN** an operator or developer prepares the repository locally
- **THEN** the supported dependency installation command is `bun install`
- **AND** the repository does not rely on `package-lock.json` as the authoritative lockfile

#### Scenario: Node runtime entrypoints remain unchanged after the package-manager migration
- **WHEN** dependencies have been installed through Bun
- **THEN** the supported runtime entrypoints remain the existing Node-based `start`, `dev`, and `test` commands
- **AND** the system does not require Bun as the process runtime for service execution

### Requirement: Host installation SHALL use Bun for dependency installation
The host installation workflow SHALL install project dependencies with Bun while preserving the existing Node-based launcher and managed-service execution semantics.

#### Scenario: Fresh host install resolves dependencies through Bun
- **WHEN** an operator installs the project through the supported host installer
- **THEN** the installer uses Bun to install the project dependencies into the extracted app directory
- **AND** it continues to prepare the existing Node-based launcher and service lifecycle

#### Scenario: Host installer handles missing Bun clearly
- **WHEN** the supported host installer needs to install dependencies on a host where `bun` is not already available
- **THEN** the installer either bootstraps Bun through a supported path or fails with a clear operator-facing remediation message

### Requirement: Package-manager guidance SHALL distinguish install tool from runtime
The operator-facing setup guidance SHALL clearly distinguish Bun-based dependency installation from Node-based execution semantics.

#### Scenario: Quick-start guidance reflects the partial migration boundary
- **WHEN** an operator reads the repository setup or host install documentation
- **THEN** the documentation states that Bun is used for dependency installation and lockfile management
- **AND** it also states that Node remains the supported execution runtime for local scripts and the managed service
