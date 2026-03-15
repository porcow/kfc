## Purpose
Define the suppression rules for duplicate Feishu ingress events before they reach business logic.

## Requirements

### Requirement: Duplicate Feishu ingress events are suppressed before business handling
The system SHALL suppress duplicate Feishu ingress events before they enter task, confirmation, or reply logic.

#### Scenario: Duplicate message delivery is suppressed
- **WHEN** the same `im.message.receive_v1` event is delivered more than once within the dedup window
- **THEN** the system processes it at most once
- **AND** it does not send duplicate response cards for the suppressed copies

#### Scenario: Duplicate card action is suppressed
- **WHEN** the same `card.action.trigger` event is delivered more than once within the dedup window
- **THEN** the system processes it at most once
- **AND** it does not invoke duplicate confirmation or cancellation business logic for the suppressed copies
