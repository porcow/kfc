## ADDED Requirements

### Requirement: Authorized users can receive bot connection event notifications through Feishu
The system SHALL proactively notify subscribed authorized users when a bot first comes online in the current service session or when it reconnects after a sufficiently long outage.

#### Scenario: Bot sends an online notification after first successful connection in the current process session
- **WHEN** a bot instance reaches its first successful Feishu WebSocket `connected` state after the current service process session starts
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_online`
- **AND** the notification is delivered through user-directed Feishu messaging rather than a cron chat subscription

#### Scenario: Bot sends a reconnected notification after a long enough outage
- **WHEN** a bot instance transitions back to `connected` after previously entering a disconnected or reconnecting outage window
- **AND** the outage duration is at least 5 minutes
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_reconnected`
- **AND** the notification includes the bot recovery time and outage duration

#### Scenario: Short reconnect jitter does not produce a proactive notification
- **WHEN** a bot instance drops out of `connected` but reconnects in less than 5 minutes
- **THEN** the system does not send a `service_reconnected` notification

#### Scenario: Connection notifications use private user delivery
- **WHEN** the system delivers a bot connection event notification
- **THEN** it addresses the Feishu message to the subscribed user identity for that bot
- **AND** it does not require an originating chat from a prior command interaction
