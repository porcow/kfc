## ADDED Requirements

### Requirement: Feishu-facing audit timestamps are formatted at render time
The system SHALL preserve canonical persisted run and monitor timestamps internally, and SHALL format those timestamps into `YYYY/MM/DD HH:mm:ss` only when rendering Feishu-facing content.

#### Scenario: Persisted run record remains the source of truth
- **WHEN** the system prepares a Feishu-facing run card from persisted run data
- **THEN** it reads the canonical persisted timestamps from the run record
- **AND** it formats them into `YYYY/MM/DD HH:mm:ss` during rendering rather than changing the stored values

#### Scenario: Persisted monitor timestamps remain the source of truth
- **WHEN** the system prepares a Feishu proactive monitoring card from persisted monitor state
- **THEN** it reads the canonical persisted timestamps from monitor storage
- **AND** it formats them into `YYYY/MM/DD HH:mm:ss` during Feishu rendering rather than changing the stored values
