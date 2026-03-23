## ADDED Requirements

### Requirement: Authorized users can manage service-event quiet hours from Feishu
The system SHALL allow an authorized Feishu user to configure, inspect, enable, and disable bot-scoped quiet hours for proactive service-event notifications through `/shutup` commands.

#### Scenario: Authorized user sets quiet hours
- **WHEN** an authorized Feishu user sends `/shutup from 22:00:00 to 07:00:00`
- **THEN** the system persists that user's quiet-hours window for the current bot
- **AND** it enables the quiet-hours configuration immediately
- **AND** the response confirms the saved start time, end time, and enabled state

#### Scenario: Authorized user checks quiet-hours status
- **WHEN** an authorized Feishu user sends `/shutup status`
- **THEN** the system returns the current quiet-hours configuration for that user and bot
- **AND** the response includes the saved start time, end time, enabled state, and whether the current local time is inside the quiet-hours window
- **AND** the response identifies that evaluation uses the bot host's local time zone

#### Scenario: Authorized user enables an existing quiet-hours configuration
- **WHEN** an authorized Feishu user sends `/shutup on`
- **AND** a quiet-hours window has already been saved for that user and bot
- **THEN** the system enables the saved configuration without changing the stored times

#### Scenario: Authorized user disables quiet hours
- **WHEN** an authorized Feishu user sends `/shutup off`
- **AND** a quiet-hours window has already been saved for that user and bot
- **THEN** the system disables the quiet-hours configuration without deleting the stored times

#### Scenario: Quiet-hours enable requires a saved window
- **WHEN** an authorized Feishu user sends `/shutup on`
- **AND** no quiet-hours window has been saved for that user and bot
- **THEN** the system rejects the request
- **AND** it returns clear validation feedback instructing the user to set a time range first

#### Scenario: Quiet-hours range validates exact clock times
- **WHEN** an authorized Feishu user sends `/shutup from 24:00:00 to 07:00:00` or uses any other invalid time token
- **THEN** the system rejects the request
- **AND** it returns clear validation feedback indicating the required `HH:mm:ss` format

#### Scenario: Quiet-hours range rejects equal start and end times
- **WHEN** an authorized Feishu user sends `/shutup from 22:00:00 to 22:00:00`
- **THEN** the system rejects the request
- **AND** it returns clear validation feedback indicating that the start and end times must differ

#### Scenario: Help card advertises quiet-hours commands
- **WHEN** an authorized Feishu user sends `/help`
- **THEN** the response includes `/shutup from HH:mm:ss to HH:mm:ss`
- **AND** it includes `/shutup status`
- **AND** it includes `/shutup on` and `/shutup off`

## MODIFIED Requirements

### Requirement: Authorized users can receive bot connection event notifications through Feishu
The system SHALL proactively notify subscribed authorized users about host power events and service-availability events through Feishu, unless delivery of the corresponding event is currently suppressed by that actor's enabled quiet-hours configuration.

#### Scenario: Bot sends a best-effort sleeping notification
- **WHEN** the host power observer reports that the machine is entering sleep
- **AND** the service still has enough runtime and network availability to attempt a Feishu send
- **AND** a subscribed user is not currently inside enabled quiet hours for the event time
- **THEN** the system sends a proactive Feishu notification to that subscribed user for event type `system_sleeping`
- **AND** the notification is best-effort rather than guaranteed

#### Scenario: Repeated sleep observations in one sleep phase do not create duplicate user notifications
- **WHEN** the host power observer reports multiple sleep observations before any later wake phase is accepted
- **THEN** the system sends at most one proactive Feishu notification of type `system_sleeping` for that sleep phase
- **AND** later duplicate sleep observations are treated as diagnostic-only

#### Scenario: Bot sends a wake notification after wake is observed and deliverability returns
- **WHEN** the host power observer reports that the machine has woken
- **AND** the bot later regains enough effective availability to deliver Feishu notifications
- **AND** a subscribed user is not currently inside enabled quiet hours for the wake event time
- **THEN** the system sends a proactive Feishu notification to that subscribed user for event type `system_woke`
- **AND** it does so as soon as practical after availability is restored

#### Scenario: Pending wake notification is superseded by a later sleep
- **WHEN** the host power observer records a wake and the corresponding `system_woke` notification has not yet been delivered
- **AND** the host power observer later records a newer sleep phase before wake delivery occurs
- **THEN** the system cancels the older pending wake notification
- **AND** it does not later send that stale `system_woke` notification

#### Scenario: Delivered wake notification uses wake-local snapshot context
- **WHEN** the system eventually delivers a deferred `system_woke` notification
- **THEN** the rendered Feishu card uses the wake event's captured snapshot timestamps
- **AND** it does not render `Last sleep` or `Last wake` values taken from later mutable power state

#### Scenario: Bot sends an online notification to subscribed users
- **WHEN** a bot first transitions into `connected` during the current main-service process session
- **AND** a subscribed user is not currently inside enabled quiet hours for the connection event time
- **THEN** the system may send a proactive Feishu notification to that subscribed user for event type `service_online`
- **AND** the notification includes the bot identifier, connection time, and host context

#### Scenario: Bot sends a diagnostic reconnected notification when explicitly subscribed
- **WHEN** the reconnect evaluator succeeds while effective WebSocket availability is currently present
- **AND** the user is subscribed to diagnostic reconnect notifications
- **AND** that subscribed user is not currently inside enabled quiet hours for the reconnect event time
- **THEN** the system sends a proactive Feishu notification to that subscribed user for event type `service_reconnected`
- **AND** the notification includes the bot recovery time and heartbeat-gap duration

#### Scenario: Quiet hours suppress applicable service-event notifications
- **WHEN** a subscribed authorized user has enabled quiet hours for the current bot
- **AND** the current event type is one of `system_sleeping`, `system_woke`, `service_online`, or `service_reconnected`
- **AND** the event timestamp falls inside the configured quiet-hours window
- **THEN** the system suppresses proactive delivery of that event to that user
- **AND** it does not remove or disable the underlying service-event subscription

#### Scenario: Quiet hours support cross-midnight windows
- **WHEN** a subscribed authorized user enables quiet hours from `22:00:00` to `07:00:00`
- **AND** an applicable service event occurs at `23:30:00` or `06:30:00` in the bot host's local time
- **THEN** the system suppresses delivery for that user
- **AND** an applicable service event occurring at `12:00:00` remains eligible for delivery

#### Scenario: Quiet-hours preferences survive allowlist churn
- **WHEN** an allowlisted user saves quiet hours for a bot
- **AND** that user is later removed from the bot allowlist and later re-added
- **THEN** the previously saved quiet-hours configuration remains available for that user and bot
- **AND** the user can resume using `/shutup status`, `/shutup on`, and `/shutup off` without recreating the time range

#### Scenario: Default service-event subscription prioritizes power notifications
- **WHEN** an allowlisted user is auto-subscribed to service-level notifications for a bot
- **THEN** the default Feishu-facing service-event subscription set includes `system_sleeping` and `system_woke`
- **AND** it does not automatically include `service_reconnected`
