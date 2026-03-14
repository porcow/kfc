## MODIFIED Requirements

### Requirement: Authorized users can manage cronjob tasks from Feishu
The system SHALL allow an authorized Feishu user to inspect and control configured cronjob tasks through `/cron` commands without mixing them into the one-shot `/run` flow.

#### Scenario: Authorized user lists cronjob tasks
- **WHEN** an authorized user sends `/cron list`
- **THEN** the system returns the configured cronjob tasks for that bot
- **AND** the response identifies each task as launchd-managed rather than one-shot
- **AND** the response includes whether the current Feishu chat is subscribed to each task's proactive notifications
- **AND** the response includes each task's current runtime state

#### Scenario: Authorized user starts a cronjob task
- **WHEN** an authorized user sends `/cron start TASK_ID` for a configured cronjob task from a Feishu chat
- **THEN** the system subscribes that current chat to the task's proactive notifications
- **AND** it reconciles the corresponding launchd job into the started state if it is not already running
- **AND** it does not restart the job solely because the same chat or another chat reissued `/cron start` while the task was already running
- **AND** the response includes the task identifier and resulting subscription-aware cron state summary

#### Scenario: Authorized user stops a cronjob task globally
- **WHEN** an authorized user sends `/cron stop TASK_ID` for a configured cronjob task
- **THEN** the system reconciles the corresponding launchd job into the stopped state
- **AND** it clears all chat subscriptions for that task
- **AND** the response includes the task identifier and the resulting stopped state summary

#### Scenario: Authorized user checks cronjob status
- **WHEN** an authorized user sends `/cron status`
- **THEN** the system returns the observed cronjob runtime state for that bot's configured cronjob tasks
- **AND** each entry includes at least the `task_id` and observed `running` or `stopped` state

#### Scenario: User sends /cron for a one-shot task
- **WHEN** an authorized user sends `/cron start TASK_ID` or `/cron stop TASK_ID` for a task whose execution mode is `oneshot`
- **THEN** the system rejects the request
- **AND** it returns a task-mode mismatch response stating that the task is not a cronjob task
