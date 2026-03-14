## ADDED Requirements

### Requirement: Duplicate inbound deliveries do not produce duplicate user-visible replies
The system SHALL avoid sending duplicate Feishu replies when the same inbound event is delivered more than once.

#### Scenario: Duplicate `/cron list` delivery does not duplicate the reply
- **WHEN** Feishu delivers the same `/cron list` message event multiple times within the dedup window
- **THEN** the user-visible reply is emitted only once
- **AND** suppressed duplicates do not re-enter the message command handler

#### Scenario: Duplicate confirm action does not duplicate the card response
- **WHEN** Feishu delivers the same confirmation card action multiple times within the dedup window
- **THEN** the system returns at most one effective response for that action
- **AND** suppressed duplicates do not re-enter the card-action handler
