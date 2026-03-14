## 1. Subscription Persistence

- [x] 1.1 Add a per-bot SQLite store for cron chat subscriptions keyed by bot, task, and chat.
- [x] 1.2 Expose repository helpers to upsert a chat subscription, list subscriptions for a task, query whether a specific chat is subscribed, and clear subscriptions for a task.
- [x] 1.3 Keep cron runtime state and chat subscription state separate so runtime records survive subscription clearing.

## 2. `/cron` Interaction Semantics

- [x] 2.1 Update `/cron start TASK_ID` to subscribe the current Feishu chat and ensure the cron task is running without restarting an already running job.
- [x] 2.2 Update `/cron stop TASK_ID` to stop the cron task globally and clear all subscriptions for that task.
- [x] 2.3 Update `/cron list` to render `task_id`, current-chat subscription state, and runtime state.
- [x] 2.4 Update `/cron status` to render `task_id` plus observed `running/stopped` state only.
- [x] 2.5 Preserve task-mode mismatch handling for one-shot tasks routed through `/cron`.

## 3. Monitoring Delivery Fan-out

- [x] 3.1 Remove the fixed `notification_chat_id` requirement from monitoring-style cron task configuration validation.
- [x] 3.2 Change `checkPDWin11` to emit notification payloads without embedding a fixed Feishu destination.
- [x] 3.3 Update outer `kfc exec --bot ... --task ...` delivery flow to resolve subscribed chats for the task and fan out notifications.
- [x] 3.4 Log per-chat proactive delivery failures without failing the underlying monitoring task execution or removing subscriptions.

## 4. Runtime and Migration

- [x] 4.1 Make cron start runtime behavior idempotent so a duplicate start request does not restart an already running launchd job.
- [x] 4.2 Preserve `auto_start` startup and reload reconciliation semantics even when a task currently has zero subscriptions.
- [x] 4.3 Migrate sample configuration and monitor-task documentation away from fixed `notification_chat_id` destinations.

## 5. Verification

- [x] 5.1 Add repository tests for subscription upsert, duplicate suppression, lookup, and global clear-on-stop.
- [x] 5.2 Add service tests for `/cron start`, `/cron stop`, `/cron list`, and `/cron status` using current-chat subscription semantics.
- [x] 5.3 Add execution tests showing monitoring notifications fan out to multiple subscribed chats and tolerate partial delivery failures.
- [x] 5.4 Update manual verification guidance for multi-chat monitor subscriptions and global stop behavior.
