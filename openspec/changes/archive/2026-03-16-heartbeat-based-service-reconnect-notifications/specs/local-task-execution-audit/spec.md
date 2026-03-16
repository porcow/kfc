## MODIFIED Requirements

### Requirement: Bot connection event state is persisted independently from run and cron state
The system SHALL persist service connection-event state per bot so online-session and heartbeat-based reconnect detection survive process restarts and remain separate from run history and cron runtime state.

#### Scenario: Bot persists successful heartbeat timestamps
- **WHEN** a bot heartbeat evaluator confirms that the Feishu long connection is currently `connected`
- **THEN** the system records the current heartbeat success timestamp in persisted service-event state
- **AND** that timestamp becomes the prior-success reference for the next heartbeat evaluation

#### Scenario: Bot persists reconnect notification bookkeeping
- **WHEN** a bot sends a `service_reconnected` notification after a successful heartbeat gap exceeds the reconnect threshold
- **THEN** the system updates the persisted bot connection-event state with the current heartbeat success time and the last reconnect notification time

#### Scenario: Service-online notification is session-scoped rather than permanently deduplicated
- **WHEN** a bot process restarts and the bot reaches its first successful `connected` state in the new process session
- **THEN** the system may emit a new `service_online` notification even if it emitted one in a prior process session
- **AND** this session-scoped dedup is tracked in process memory rather than as a permanent bot-history flag

#### Scenario: Fresh reinstall may initialize the new service-event schema without historical compatibility
- **WHEN** the operator upgrades through `kfc uninstall` followed by a fresh install
- **THEN** the system may create a fresh sqlite database using only the heartbeat-based service-event state schema
- **AND** it does not need to preserve or translate historical `last_disconnected_at` data from a prior installation

### Requirement: WebSocket connection transitions can emit service event notifications
The system SHALL emit `service_online` from the first successful WebSocket connection in the current process session and SHALL emit `service_reconnected` from heartbeat-success gaps rather than from reconnect/disconnect transition windows.

#### Scenario: First successful connected state emits service_online
- **WHEN** a bot runtime reaches its first successful WebSocket `connected` state after the main service process starts
- **THEN** the system emits one `service_online` event notification for that process session

#### Scenario: Large heartbeat-success gap emits service_reconnected
- **WHEN** the bot heartbeat evaluator runs while the bot is currently `connected`
- **AND** a prior successful heartbeat timestamp exists
- **AND** the elapsed time between the current successful heartbeat and the prior successful heartbeat is at least the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system emits one `service_reconnected` event notification

#### Scenario: Small heartbeat-success gap does not emit service_reconnected
- **WHEN** the bot heartbeat evaluator runs while the bot is currently `connected`
- **AND** a prior successful heartbeat timestamp exists
- **AND** the elapsed time between the current successful heartbeat and the prior successful heartbeat is less than the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system does not emit `service_reconnected`

#### Scenario: Reconnect threshold defaults to one hour
- **WHEN** the operator does not configure `server.service_reconnect_notification_threshold_ms`
- **THEN** the system uses a default reconnect notification threshold of `3600000` milliseconds
