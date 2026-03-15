## ADDED Requirements

### Requirement: Bot connection event subscriptions are persisted and reconciled from allowlists
The system SHALL persist service-level event subscriptions separately from task and cron subscriptions, and SHALL reconcile them against each bot's `allowed_users`.

#### Scenario: Allowlisted user receives default service event subscriptions
- **WHEN** a bot starts or reloads configuration with an `allowed_users` entry not yet present in service event subscriptions
- **THEN** the system creates enabled default subscriptions for that actor for `service_online` and `service_reconnected`

#### Scenario: Removed allowlisted user loses service event subscriptions
- **WHEN** a bot reloads configuration and an actor is no longer present in that bot's `allowed_users`
- **THEN** the system removes or disables that actor's persisted service event subscriptions for that bot

#### Scenario: Service event subscriptions remain bot-scoped
- **WHEN** multiple bots are loaded in the same process
- **THEN** each bot persists and resolves its own service event subscriptions independently by `bot_id`

### Requirement: Bot connection event state is persisted independently from run and cron state
The system SHALL persist service connection-event state per bot so reconnect detection survives process restarts and remains separate from run history and cron runtime state.

#### Scenario: Bot persists the start of an outage window
- **WHEN** a bot transitions from `connected` into `reconnecting` or `disconnected`
- **THEN** the system records `last_disconnected_at` as the start of the current outage window
- **AND** it does not overwrite that timestamp on subsequent retry churn inside the same outage window

#### Scenario: Bot persists reconnect notification bookkeeping
- **WHEN** a bot sends a `service_reconnected` notification after recovering from an outage window
- **THEN** the system updates the persisted bot connection-event state with the reconnect time and the last reconnect notification time

#### Scenario: Service-online notification is session-scoped rather than permanently deduplicated
- **WHEN** a bot process restarts and the bot reaches its first successful `connected` state in the new process session
- **THEN** the system may emit a new `service_online` notification even if it emitted one in a prior process session
- **AND** this session-scoped dedup is tracked in process memory rather than as a permanent bot-history flag

### Requirement: WebSocket connection transitions can emit service event notifications
The system SHALL interpret bot WebSocket state transitions as service event triggers and emit notifications only when the transition semantics match the configured service event rules.

#### Scenario: First connection in a process session emits service_online
- **WHEN** a bot runtime has not yet emitted `service_online` in the current process session
- **AND** its WebSocket health transitions into `connected`
- **THEN** the system emits one `service_online` event notification for that bot in that process session

#### Scenario: Recovery after long outage emits service_reconnected
- **WHEN** a bot runtime has a persisted outage window start time
- **AND** its WebSocket health transitions back into `connected`
- **AND** the outage duration is at least 5 minutes
- **THEN** the system emits one `service_reconnected` event notification for that outage window

#### Scenario: Recovery after short outage does not emit service_reconnected
- **WHEN** a bot runtime transitions back into `connected`
- **AND** the elapsed time since `last_disconnected_at` is less than 5 minutes
- **THEN** the system does not emit `service_reconnected`
