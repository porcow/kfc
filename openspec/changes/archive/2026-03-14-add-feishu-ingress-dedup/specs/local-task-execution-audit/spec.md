## ADDED Requirements

### Requirement: Ingress dedup is stored durably per bot
The system SHALL persist ingress dedup keys in the bot-scoped SQLite store so duplicate delivery suppression does not depend on process memory.

#### Scenario: Duplicate delivery after a short reconnect is still suppressed
- **WHEN** a duplicate Feishu event arrives after the process has already recorded the original event within the configured dedup window
- **THEN** the system suppresses the duplicate based on the persisted ingress dedup store

### Requirement: Duplicate suppressions are audit logged
The system SHALL log when a duplicate ingress event is intentionally suppressed.

#### Scenario: Duplicate suppression is written to the event log
- **WHEN** a duplicate message or card action is suppressed
- **THEN** the system records a structured event-log entry with decision `duplicate_suppressed`
- **AND** the log includes the inbound event type and command or action classification when available
