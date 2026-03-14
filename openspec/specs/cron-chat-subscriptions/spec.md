## ADDED Requirements

### Requirement: The system persists chat subscriptions for cron notification tasks
The system SHALL persist bot-scoped, task-scoped Feishu chat subscriptions for cron-managed monitoring tasks using `chat_id` as the subscription key.

#### Scenario: Chat subscribes to a cron task
- **WHEN** an authorized Feishu user sends `/cron start TASK_ID` from a chat for a configured cronjob task
- **THEN** the system persists a subscription for that `(bot_id, task_id, chat_id)` tuple
- **AND** it does not create duplicate subscription rows for the same tuple

#### Scenario: Different chats subscribe to the same cron task
- **WHEN** authorized users send `/cron start TASK_ID` from two different chats for the same bot and task
- **THEN** the system persists both subscriptions
- **AND** later notifications for that task can be delivered to both chats

#### Scenario: Global stop clears subscriptions
- **WHEN** an authorized Feishu user sends `/cron stop TASK_ID` for a configured cronjob task
- **THEN** the system removes all persisted subscriptions for that `(bot_id, task_id)`
- **AND** no further proactive monitor notifications are fanned out for that task until new subscriptions are created

### Requirement: Monitoring notifications are fanned out to subscribed chats
The system SHALL fan out proactive monitoring notifications to the subscribed chats for the originating bot and task rather than reading a fixed destination from TOML.

#### Scenario: Lifecycle transition fans out to subscribed chats
- **WHEN** a monitoring-style cron task emits a proactive notification payload for a lifecycle transition
- **THEN** the outer execution layer looks up all subscribed chats for that `(bot_id, task_id)`
- **AND** it attempts delivery to each subscribed `chat_id`

#### Scenario: No subscribed chats exist
- **WHEN** a monitoring-style cron task emits a proactive notification payload but the task has zero subscribed chats
- **THEN** the system performs no Feishu delivery fan-out
- **AND** the task execution result remains otherwise successful

#### Scenario: Delivery to one subscribed chat fails
- **WHEN** fan-out delivery succeeds for at least one subscribed chat and fails for another
- **THEN** the system logs the per-chat delivery failure
- **AND** it does not fail the monitoring task execution solely because of that delivery failure
- **AND** it does not automatically remove the failing subscription
