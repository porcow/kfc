## ADDED Requirements

### Requirement: Monitoring notifications are rendered as titled Feishu cards
The system SHALL render proactive `checkPDWin11` notifications as informational Feishu cards with explicit titles rather than body-only text messages.

#### Scenario: Startup monitoring notification is rendered as a card
- **WHEN** `checkPDWin11` emits an `off -> on` proactive notification
- **THEN** the Feishu delivery layer sends an informational card with the title `MC 启动!`

#### Scenario: Shutdown monitoring notification is rendered as a card
- **WHEN** `checkPDWin11` emits an `on -> off` proactive notification
- **THEN** the Feishu delivery layer sends an informational card with the title `MC 下线!`

#### Scenario: Runtime reminder is rendered as a titled card
- **WHEN** `checkPDWin11` emits an `on -> on` runtime reminder notification
- **THEN** the Feishu delivery layer sends an informational card whose title reflects the actual uptime, such as `MC 已运行 1小时20分`
