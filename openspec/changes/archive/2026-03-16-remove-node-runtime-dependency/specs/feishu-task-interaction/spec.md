## ADDED Requirements

### Requirement: Feishu integration remains functional under Bun-only runtime support
The system SHALL preserve its Feishu command, card, messaging, and upload behavior when Bun is the only supported runtime.

#### Scenario: Feishu SDK-dependent test paths remain runnable under Bun
- **WHEN** the project executes its supported Bun test suite
- **THEN** the Feishu SDK-dependent tests pass without relying on a Node runtime fallback

#### Scenario: Bun-only runtime preserves Feishu command handling
- **WHEN** the service handles Feishu text commands, card callbacks, and result delivery under the supported runtime
- **THEN** the system preserves the existing Feishu-facing behavior for task execution, status cards, health replies, and uploads
