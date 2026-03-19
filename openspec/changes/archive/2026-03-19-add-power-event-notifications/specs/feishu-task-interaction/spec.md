## MODIFIED Requirements

### Requirement: Authorized users can receive bot connection event notifications through Feishu
The system SHALL proactively notify subscribed authorized users about host power events and service-availability events through Feishu.

#### Scenario: Bot sends a best-effort sleeping notification
- **WHEN** the host power observer reports that the machine is entering sleep
- **AND** the service still has enough runtime and network availability to attempt a Feishu send
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `system_sleeping`
- **AND** the notification is best-effort rather than guaranteed

#### Scenario: Bot sends a wake notification after wake is observed and deliverability returns
- **WHEN** the host power observer reports that the machine has woken
- **AND** the bot later regains enough effective availability to deliver Feishu notifications
- **THEN** the system sends a proactive Feishu notification to each subscribed user for event type `system_woke`
- **AND** it does so as soon as practical after availability is restored

#### Scenario: Bot sends an online notification after first successful connection in the current process session
- **WHEN** a bot instance reaches its first successful Feishu WebSocket `connected` state after the current service process session starts
- **THEN** the system may send a proactive Feishu notification to each subscribed user for event type `service_online`
- **AND** this event remains available even if power notifications are the operator's primary alert path

#### Scenario: Bot sends a diagnostic reconnected notification when explicitly subscribed
- **WHEN** a bot reconnect evaluator succeeds after a long enough successful-heartbeat gap
- **AND** the user is subscribed to diagnostic reconnect notifications
- **THEN** the system sends a proactive Feishu notification for event type `service_reconnected`

#### Scenario: Default service-event subscription prioritizes power notifications
- **WHEN** an allowlisted user is auto-subscribed to service-level notifications for a bot
- **THEN** the default Feishu-facing service-event subscription set includes `system_sleeping` and `system_woke`
- **AND** it does not automatically include `service_reconnected`
