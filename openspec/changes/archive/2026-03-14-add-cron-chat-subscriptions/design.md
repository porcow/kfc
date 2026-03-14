## Context

The repository already supports Feishu-driven `/cron` commands, launchd-backed cronjob execution, bot-scoped proactive Feishu delivery, and a monitoring-style built-in tool `checkPDWin11`. The current monitor-task design binds proactive notifications to a single fixed `notification_chat_id` in TOML. That model is operationally awkward because cron tasks are discovered and managed from Feishu chats, multiple chats may care about the same task, and the current `/cron start` / `/cron stop` lifecycle does not track who is actually subscribed to monitor notifications.

We now want `/cron` to act as both a runtime-control surface and a chat subscription surface:
- `/cron start TASK_ID` subscribes the current chat to the task and ensures the task is running
- `/cron stop TASK_ID` stops the task globally and clears all subscriptions for that task
- monitoring-style cron tasks fan out notifications to subscribed chats instead of reading a fixed destination from TOML

At the same time, `auto_start` remains valid: service startup may run a cron task even when no chats are currently subscribed.

## Goals / Non-Goals

**Goals:**
- Introduce durable bot-scoped, task-scoped cron chat subscriptions keyed by Feishu `chat_id`.
- Separate cron runtime state from notification subscription state so tasks may run with zero subscribers when `auto_start = true`.
- Redefine `/cron start` to be subscribe-plus-ensure-running and avoid unnecessary task restarts.
- Redefine `/cron stop` to stop a task globally and clear all subscriptions for that task.
- Replace fixed monitor-task `notification_chat_id` delivery with outer-runner fan-out to subscribed chats.
- Update `/cron list` and `/cron status` to expose current-chat subscription state and observed running state clearly.

**Non-Goals:**
- Per-chat selective unsubscribe while keeping the task running.
- Automatic unsubscription when Feishu delivery to one chat fails.
- General-purpose notification subscriptions for one-shot `/run` tasks.
- Replacing `auto_start` or removing launchd as the cron runtime authority.

## Decisions

### 1. Cron runtime state and chat subscription state are separate persistent models

Cron task execution state and chat subscription state SHALL be persisted separately.

- Existing cron lifecycle persistence remains keyed by `(bot_id, task_id)` and tracks desired and observed runtime state.
- New cron subscription persistence SHALL be keyed by `(bot_id, task_id, chat_id)` and track which chats are subscribed to notifications for that task.

This separation preserves the meaning of `auto_start = true`: a cron task may be running even when there are no subscribed chats.

Alternative considered:
- Derive running state purely from subscription count: rejected because it conflicts with retained `auto_start` semantics.
- Store subscriptions inside task config: rejected because subscriptions are runtime/user-driven state, not source-controlled configuration.

### 2. `/cron start` becomes subscribe-plus-ensure-running

For cronjob tasks, `/cron start TASK_ID` SHALL:
- validate that the task is a cronjob task
- add the current Feishu `chat_id` to that task's subscription set if not already present
- ensure the task is running
- avoid restarting an already running job solely because another `/cron start` was received

This makes `/cron start` logically idempotent for a chat that is already subscribed and a task that is already running.

Alternative considered:
- Keep current restart-on-every-start behavior: rejected because it produces unnecessary churn and weak operator semantics.
- Subscribe the chat but defer task start until next reconciliation: rejected because it makes `/cron start` feel laggy and indirect.

### 3. `/cron stop` is a global stop and clears subscriptions

`/cron stop TASK_ID` SHALL be a global task-level operation, not a per-chat unsubscribe.

When invoked successfully, the system SHALL:
- stop the launchd job for the task
- clear all persisted subscriptions for that `(bot_id, task_id)`

This avoids stale state where chats appear subscribed to a task that has been explicitly stopped globally.

Alternative considered:
- Make `/cron stop` unsubscribe only the current chat and stop the task only when no subscribers remain: rejected because the requested product semantics now treat stop as a global operator command.
- Stop the task but retain subscriptions: rejected because it leaves ambiguous dormant subscriptions that interact poorly with later restarts and `auto_start`.

### 4. Monitoring-style cron tasks emit notification content, not destination addresses

Monitoring-style cron tasks such as `checkPDWin11` SHALL stop reading a fixed `notification_chat_id` from task config. Instead:
- the tool returns notification content and metadata indicating that proactive fan-out is required
- the outer runner resolves the subscribed chats for `(bot_id, task_id)`
- the outer runner fans out delivery to each subscribed `chat_id`

This keeps built-in monitor tools focused on detection and transition logic while reusing bot-scoped delivery outside the tool boundary.

Alternative considered:
- Keep a list of chat IDs in TOML: rejected because subscriptions are dynamic and chat-driven.
- Let the tool load subscriptions and send Feishu messages directly: rejected because it duplicates bot-scoped delivery logic inside the tool.

### 5. `auto_start` remains runtime policy only

`auto_start` SHALL continue to govern startup and reload reconciliation exactly as a runtime policy:
- if `auto_start = true`, startup/reload may run the task even with zero subscribers
- if `auto_start = false`, startup/reload does not imply runtime activation

Notification fan-out remains gated by subscription membership, not by runtime state alone.

Alternative considered:
- Disable `auto_start` for monitor tasks: rejected because the user explicitly wants to keep it valid.

### 6. `/cron list` and `/cron status` answer different questions

The Feishu surfaces SHALL diverge intentionally:
- `/cron list` shows configured cron tasks with:
  - `task_id`
  - whether the current chat is subscribed
  - current runtime state
- `/cron status` shows runtime-oriented state only:
  - `task_id`
  - observed `running/stopped`

This keeps `/cron list` useful for the current chat's subscription management while `/cron status` remains a terse operator health view.

Alternative considered:
- Show identical information in both commands: rejected because the two commands then collapse into one another.

### 7. Fan-out delivery failures are logged but do not alter task or subscription state

When proactive delivery to one or more subscribed chats fails:
- the cron task execution still succeeds if detection logic succeeded
- the subscription set remains unchanged
- the system emits per-chat delivery failure logs for operators

This matches the existing principle that notification delivery should not silently rewrite durable state or invalidate successful task execution.

Alternative considered:
- Auto-remove failing chats from the subscription set: rejected because transient Feishu or permission issues would cause surprising silent data loss.

## Risks / Trade-offs

- [Subscription state grows over time for abandoned chats] → Provide global clearing on `/cron stop` and keep records keyed tightly by bot, task, and chat.
- [A task may run with zero subscribers when `auto_start = true`] → Keep runtime and subscription state explicitly separate and render subscription state in `/cron list`.
- [Repeated `/cron start` calls from different chats race with launchd state changes] → Make start perform idempotent subscription upsert plus ensure-running semantics rather than unconditional restart.
- [Delivery fan-out may partially fail] → Log per-chat failures and keep runtime/subscription state unchanged.
- [Existing monitor-task configs still contain `notification_chat_id`] → Treat the old field as deprecated and migrate monitor tasks to subscription-driven delivery during implementation.

## Migration Plan

1. Add SQLite-backed cron subscription persistence keyed by bot, task, and chat.
2. Update `/cron start`, `/cron stop`, `/cron list`, and `/cron status` semantics in the Feishu service layer.
3. Change monitoring-style cron tasks such as `checkPDWin11` to emit notification payloads without fixed destination addresses.
4. Update outer `kfc exec` delivery flow to fan out notifications to subscribed chats.
5. Remove monitor-task validation that requires `notification_chat_id` and update sample configuration and docs.
6. Preserve existing cron runtime state while migrating notification delivery to the new subscription model.

Rollback:
- Revert to fixed-destination notification behavior and drop the new subscription lookup in the outer runner.
- Existing cron runtime state remains valid because runtime and subscription data are separated.

## Open Questions

- None for proposal scope. The semantics for `auto_start`, `/cron start`, `/cron stop`, `/cron list`, `/cron status`, and fan-out failure handling are now decided.
