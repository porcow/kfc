## ADDED Requirements

### Requirement: Feishu-facing timestamps use one canonical display format
The system SHALL render every human-facing timestamp sent through the Feishu channel in the canonical local-time format `YYYY/MM/DD HH:mm:ss`.

#### Scenario: Run status card includes formatted timestamps
- **WHEN** the system renders a run status or run milestone card to Feishu
- **THEN** every displayed run timestamp, including start and finish times when present, uses the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Health reply includes formatted timestamps
- **WHEN** the system renders a `/health` response to Feishu and includes any human-facing timestamp fields
- **THEN** those timestamps use the format `YYYY/MM/DD HH:mm:ss`

#### Scenario: Different Feishu reply paths stay consistent
- **WHEN** the system sends timestamps to Feishu through different reply paths such as command replies, interactive cards, or proactive monitoring notifications
- **THEN** every human-facing timestamp uses the same `YYYY/MM/DD HH:mm:ss` format rather than mixing ISO and local display styles

#### Scenario: Protocol-layer timestamps are out of scope
- **WHEN** the system exchanges requests, responses, or callback payloads with the Feishu server-side API
- **THEN** this display-format rule does not require changing any protocol-layer timestamp field
- **AND** only timestamps rendered into the Feishu chat UI for human readers are subject to the canonical format
