## ADDED Requirements

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

### Requirement: Persistence behavior SHALL remain consistent across Node and Bun local runtimes
The system SHALL preserve the existing repository and audit semantics regardless of whether the local runtime path is using the Node backend or the Bun-compatible backend.

#### Scenario: Bun-compatible persistence preserves repository behavior
- **WHEN** the repository-local runtime executes under Bun
- **THEN** run storage, confirmation lookup, cron state, pairing state, and related persistence behavior remain consistent with the existing Node-backed repository contract

### Requirement: Bun test compatibility SHALL be handled as a separate migration phase
The system SHALL treat Bun test-runner compatibility as a distinct follow-up phase once repository-local Bun service runtime compatibility exists.

#### Scenario: Bun-incompatible test patterns are not treated as resolved by runtime-only changes
- **WHEN** the repository still contains `node:test` patterns or other test constructs that Bun does not support
- **THEN** the migration does not claim full Bun test compatibility yet
- **AND** those incompatibilities remain explicit work items for the dedicated test-compatibility phase
