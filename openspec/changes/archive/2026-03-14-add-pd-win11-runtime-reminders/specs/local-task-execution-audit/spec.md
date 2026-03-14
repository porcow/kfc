## ADDED Requirements

### Requirement: Built-in tool notification intents support titled proactive cards
The system SHALL allow built-in tools to return proactive notification intents that include both a card title and body content so the outer runner can render informational Feishu cards without tool-local SDK ownership.

#### Scenario: Built-in tool returns a titled proactive notification
- **WHEN** a built-in tool produces a proactive Feishu notification intent
- **THEN** the notification contract includes a title field and body field
- **AND** the outer runner can deliver that notification without inferring the title from free-form text

### Requirement: Durable monitor state tracks runtime reminder timing
The system SHALL persist the reminder timing metadata required by monitor-style built-in tools to suppress duplicate runtime reminders across cron invocations and process restarts.

#### Scenario: Runtime reminder timestamp is persisted
- **WHEN** `checkPDWin11` emits a runtime reminder notification
- **THEN** the persisted monitor-state record stores the reminder send time

#### Scenario: Missing reminder metadata is treated as no prior reminder
- **WHEN** a previously persisted monitor-state row predates the runtime-reminder feature and lacks runtime-reminder timing metadata
- **THEN** the next `checkPDWin11` invocation treats that row as having no prior runtime reminder recorded
