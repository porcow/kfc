## MODIFIED Requirements

### Requirement: Bot connection event subscriptions are persisted and reconciled from allowlists
The system SHALL persist service-level event subscriptions separately from task and cron subscriptions, and SHALL reconcile them against each bot's `allowed_users`.

#### Scenario: Allowlisted user receives default power event subscriptions
- **WHEN** a bot starts or reloads configuration with an `allowed_users` entry not yet present in service event subscriptions
- **THEN** the system creates enabled default subscriptions for that actor for `system_sleeping` and `system_woke`

#### Scenario: Diagnostic reconnect subscription is not auto-enabled by default
- **WHEN** a bot starts or reloads configuration with an `allowed_users` entry not yet present in service event subscriptions
- **THEN** the system does not automatically enable `service_reconnected` for that actor
- **AND** `service_reconnected` remains available as an optional diagnostic subscription

#### Scenario: Removed allowlisted user loses service event subscriptions
- **WHEN** a previously allowlisted user is removed from a bot's `allowed_users`
- **THEN** the system removes or disables that actor's persisted service event subscriptions for that bot

#### Scenario: Service event subscriptions remain bot-scoped
- **WHEN** two bots in the same process have independent allowlists and service event subscribers
- **THEN** each bot persists and resolves its own service event subscriptions independently by `bot_id`

### Requirement: Power event diagnostics are tracked independently from availability state
The system SHALL observe host sleep and wake events and track recent power-event diagnostics independently from the canonical service-availability predicate.

#### Scenario: Sleep event updates power diagnostics
- **WHEN** the host reports that sleep is about to occur or has been detected during a runnable pre-sleep window
- **THEN** the system records `lastSleepAt` for that runtime
- **AND** this diagnostic update does not itself redefine effective service availability

#### Scenario: Wake event updates power diagnostics
- **WHEN** the host reports that wake has occurred
- **THEN** the system records `lastWakeAt` for that runtime
- **AND** this diagnostic update does not itself redefine effective service availability

### Requirement: WebSocket connection transitions and power events can emit service event notifications
The system SHALL emit power-event notifications for sleep and wake, SHALL keep `service_online` as the first successful connected event in a process session, and SHALL keep `service_reconnected` as a diagnostic availability-recovery event.

#### Scenario: Observed sleep attempts a best-effort system_sleeping notification
- **WHEN** the service observes that the host is entering sleep while it still has a runnable window
- **THEN** the system attempts to emit one `system_sleeping` service event notification
- **AND** failure to deliver that notification does not prevent later wake or reconnect notifications

#### Scenario: Observed wake is deferred until availability is restored
- **WHEN** the service observes a host wake event
- **THEN** it records a pending wake notification for that bot runtime
- **AND** it does not require immediate Feishu sendability at the same instant as the wake observation

#### Scenario: Restored availability emits system_woke after a recorded wake
- **WHEN** a pending wake notification exists for the bot
- **AND** effective service availability becomes true after that wake
- **THEN** the system emits one `system_woke` notification as soon as it can deliver it
- **AND** it clears the pending wake notification after successful handling

#### Scenario: First connected transition emits service_online once per session
- **WHEN** a bot runtime reaches its first successful WebSocket `connected` state after the main service process starts
- **THEN** the system emits one `service_online` event notification for that process session

#### Scenario: Large heartbeat-success gap emits diagnostic service_reconnected
- **WHEN** the bot heartbeat evaluator runs while effective WebSocket availability is currently present
- **AND** a prior successful heartbeat timestamp exists
- **AND** the elapsed time between the current successful heartbeat and the prior successful heartbeat is at least the global `server.service_reconnect_notification_threshold_ms`
- **THEN** the system emits one `service_reconnected` event notification
- **AND** that event remains part of the diagnostic service-event model even when it is not default-subscribed
