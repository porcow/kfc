## MODIFIED Requirements

### Requirement: Authorized users can receive bot connection event notifications through Feishu
The system SHALL proactively notify subscribed authorized users when a bot first comes online in the current service session or when a connected-heartbeat success follows a sufficiently large gap since the previous successful heartbeat.

#### Scenario: Bot sends an online notification after first successful connection in the current process session
- **WHEN** a bot instance reaches its first successful Feishu WebSocket `connected` state after the current service process session starts
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_online`
- **AND** the notification is delivered through user-directed Feishu messaging rather than a cron chat subscription

#### Scenario: Bot sends a reconnected notification after a long enough heartbeat gap
- **WHEN** a bot heartbeat check succeeds while the bot is currently connected
- **AND** the elapsed time since the previous successful heartbeat is at least 1 hour by default
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `service_reconnected`
- **AND** the notification includes the bot recovery time and heartbeat-gap duration

#### Scenario: Short heartbeat gaps do not produce a proactive reconnect notification
- **WHEN** a bot heartbeat check succeeds while the bot is currently connected
- **AND** the elapsed time since the previous successful heartbeat is less than the configured reconnect threshold
- **THEN** the system does not send a `service_reconnected` notification

#### Scenario: Connection notifications use private user delivery
- **WHEN** the system delivers a bot connection event notification
- **THEN** it addresses the Feishu message to the subscribed user identity for that bot
- **AND** it does not require an originating chat from a prior command interaction
