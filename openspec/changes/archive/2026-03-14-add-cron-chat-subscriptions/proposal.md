## Why

The current monitor-task model sends proactive notifications to one fixed `notification_chat_id` from TOML, which does not match how operators actually discover and manage cron tasks from Feishu chats. We need a chat-driven subscription model so `/cron start` can subscribe the current chat to a task's notifications, support multiple interested chats, and remove the need to hard-code Feishu destinations in bot configuration.

## What Changes

- Add durable bot-scoped, task-scoped cron notification subscriptions keyed by `chat_id`.
- Change `/cron start TASK_ID` so it subscribes the current Feishu chat to the target cron task and ensures the task is running without restarting an already running job.
- Change `/cron stop TASK_ID` so it globally stops the target cron task and clears all chat subscriptions for that task.
- Change monitoring-style cron tasks such as `checkPDWin11` to emit notification payloads without a fixed destination; the outer runner fans out delivery to the subscribed chats for that bot and task.
- Remove the requirement that monitoring-style cron tasks declare a fixed `notification_chat_id` in TOML. **BREAKING**
- Update `/cron list` and `/cron status` responses so Feishu users can see current-chat subscription state and observed runtime state.
- Keep `auto_start` semantics intact: startup reconciliation may run a cron task even when it currently has no subscribed chats.

## Capabilities

### New Capabilities
- `cron-chat-subscriptions`: Persistent Feishu chat subscriptions for cron-managed monitor tasks, including fan-out delivery and lifecycle effects on `/cron start` and `/cron stop`.

### Modified Capabilities
- `feishu-task-interaction`: `/cron` commands now manage chat subscriptions as well as task runtime state, and `/cron list` / `/cron status` return updated subscription-aware views.
- `local-task-execution-audit`: Monitoring-style cron tasks no longer require a fixed notification destination in TOML, and cron lifecycle operations gain subscription persistence and stronger idempotency expectations.

## Impact

- Affects Feishu `/cron` command handling, cron status rendering, and bot-scoped proactive notification delivery.
- Introduces persistent cron subscription records in the per-bot SQLite store.
- Changes monitor-task configuration rules for built-in tools such as `checkPDWin11`.
- Requires launchd cron controllers and outer task execution to separate runtime control from notification fan-out.
