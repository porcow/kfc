## MODIFIED Requirements

### Requirement: Cronjob state is persisted separately from one-shot runs
The system SHALL persist cronjob management state independently from one-shot run history so launchd-managed tasks can be queried and reconciled by `task_id`.

#### Scenario: Cronjob state remains queryable after restart
- **WHEN** the service restarts after recording cronjob desired and observed state for a configured cronjob task
- **THEN** `/cron status` can still return that task's last known runtime state after restart

#### Scenario: One-shot and cronjob state do not share identifiers
- **WHEN** the system stores one-shot runs and cronjob task state for the same bot
- **THEN** one-shot audit records remain keyed by `run_id`
- **AND** cronjob state remains keyed by `task_id`

#### Scenario: Cron chat subscriptions are persisted separately from runtime state
- **WHEN** the system stores cron runtime state and chat subscriptions for the same cronjob task
- **THEN** runtime state remains keyed by `(bot_id, task_id)`
- **AND** subscription state remains keyed by `(bot_id, task_id, chat_id)`
- **AND** removing subscriptions does not by itself erase the persisted runtime state record

### Requirement: Service startup and reload reconcile launchd-managed cronjobs
The system SHALL reconcile configured cronjob tasks against `launchctl` state on startup and reload.

#### Scenario: Cron expression is translated into launchd schedule data
- **WHEN** the system activates a valid cronjob task from TOML
- **THEN** it translates the configured cron expression into the supported launchd plist schedule representation
- **AND** it rejects cron expressions that cannot be translated safely in v1

#### Scenario: Auto-start disabled cronjob is found running
- **WHEN** a configured cronjob task has `auto_start = false` and `launchctl` reports it as running during startup or reload
- **THEN** the system stops that cronjob

#### Scenario: Auto-start enabled cronjob is already running
- **WHEN** a configured cronjob task has `auto_start = true` and `launchctl` reports it as running during startup or reload
- **THEN** the system stops the cronjob and then starts it again

#### Scenario: Auto-start enabled cronjob is not running
- **WHEN** a configured cronjob task has `auto_start = true` and `launchctl` reports it as not running during startup or reload
- **THEN** the system starts that cronjob

#### Scenario: Service stop does not rewrite cronjob policy
- **WHEN** a local administrator executes `kfc service stop`
- **THEN** the system stops the main service process
- **AND** it does not rewrite the configured `auto_start` policy for cronjob tasks

## ADDED Requirements

### Requirement: Monitoring-style cron tasks deliver through subscriptions rather than fixed destinations
The system SHALL allow monitoring-style cron tasks to emit proactive notification payloads without declaring a fixed `notification_chat_id` in TOML, and SHALL let the outer execution layer resolve subscribed chats at delivery time.

#### Scenario: Monitor task configuration omits fixed notification destination
- **WHEN** a monitoring-style cron task is configured without a fixed `notification_chat_id`
- **THEN** the system accepts that task configuration
- **AND** the task remains eligible for proactive notification delivery through subscribed chats

#### Scenario: Outer execution layer resolves subscribed chats for delivery
- **WHEN** a monitoring-style cron task emits a proactive notification payload during `kfc exec --bot BOT_ID --task TASK_ID`
- **THEN** the outer execution layer resolves the subscribed chats for that `(BOT_ID, TASK_ID)`
- **AND** it fans out delivery using that bot's Feishu credentials

#### Scenario: Cron start on an already running job is idempotent for runtime state
- **WHEN** `/cron start TASK_ID` is issued for a cronjob task whose launchd job is already running
- **THEN** the system keeps the task in the running state
- **AND** it does not restart the launchd job solely because of the duplicate start request
- **AND** it may still upsert the current chat's subscription membership
