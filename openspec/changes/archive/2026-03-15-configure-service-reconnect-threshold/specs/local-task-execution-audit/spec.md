## MODIFIED Requirements

### Requirement: WebSocket connection transitions can emit service event notifications
The system SHALL interpret bot WebSocket state transitions as service event triggers and emit notifications only when the transition semantics match the configured service event rules.

#### Scenario: Recovery after configured long outage emits service_reconnected
- **WHEN** a bot runtime has a persisted outage window start time
- **AND** its WebSocket health transitions back into `connected`
- **AND** the outage duration is at least the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system emits one `service_reconnected` event notification for that outage window

#### Scenario: Recovery below configured threshold does not emit service_reconnected
- **WHEN** a bot runtime transitions back into `connected`
- **AND** the elapsed time since `last_disconnected_at` is less than the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system does not emit `service_reconnected`

#### Scenario: Reconnect threshold defaults to ten minutes
- **WHEN** the operator does not configure `server.service_reconnect_notification_threshold_ms`
- **THEN** the system uses a default reconnect notification threshold of `600000` milliseconds
