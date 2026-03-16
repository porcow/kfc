## ADDED Requirements

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
