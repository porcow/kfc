## ADDED Requirements

### Requirement: Repository test execution SHALL support direct Bun test runner usage
The repository SHALL support direct `bun test` as a first-class local test execution path for the supported test suite.

#### Scenario: Direct Bun test passes for the supported suite
- **WHEN** an operator runs `bun test` from the repository root
- **THEN** the supported repository test suite executes successfully under Bun
- **AND** the migration does not rely on delegating test execution back to Node's built-in runner

### Requirement: Test coverage SHALL remain behavior-focused during Bun migration
The test migration SHALL preserve behavioral coverage while removing unsupported or brittle Node-runner assumptions.

#### Scenario: Bun test migration removes unsupported runner constructs
- **WHEN** a test currently relies on unsupported or unreliable `node:test` constructs under Bun
- **THEN** the test is rewritten or replaced with a Bun-compatible structure
- **AND** the intended behavioral contract remains asserted

#### Scenario: Bun test migration avoids brittle runtime-specific assertions
- **WHEN** a test currently depends on Node-specific timing, ordering, or formatting side effects
- **THEN** the migration rewrites the assertion to check the intended behavior instead
- **AND** the resulting test remains deterministic under Bun

### Requirement: The package test script SHALL switch only after direct Bun test is green
The repository SHALL not claim Bun as the primary test runner until direct `bun test` passes for the supported suite.

#### Scenario: Script switch follows direct Bun verification
- **WHEN** the repository test script is updated to use Bun
- **THEN** direct `bun test` has already been verified as passing for the supported suite
- **AND** documentation reflects Bun as the supported test runner
