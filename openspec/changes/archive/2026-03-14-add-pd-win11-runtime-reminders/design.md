## Context

The repository already has a polling-style built-in tool `checkPDWin11` that runs as a cron-managed monitor. It detects whether a Parallels Desktop Windows 11 VM is present, persists `off|on` monitor state, and emits proactive Feishu notifications through the bot-scoped outer runner. Today that monitor only notifies on `off -> on` and `on -> off`, the notification payload only carries body text, and timestamps are rendered in raw machine-friendly formats.

The requested behavior adds a second notification mode while the VM remains running:
- first reminder when uptime exceeds 1 hour
- additional reminders every 10 minutes while the state remains `on`

Because the tool polls every minute, the design must remember the last runtime reminder time durably; otherwise the system would send a reminder on every poll once uptime crosses 1 hour.

## Goals / Non-Goals

**Goals:**
- Preserve the existing `off -> on` and `on -> off` transition notifications.
- Add a durable `on -> on` runtime-reminder path that triggers once at the first post-1-hour poll and then every 10 minutes while the VM remains on.
- Render proactive `checkPDWin11` notifications as Feishu cards with explicit titles.
- Standardize all `checkPDWin11` notification timestamps to `YYYY/MM/DD HH:mm:ss` in the host's local timezone.
- Keep delivery bot-scoped and subscription-driven through the existing outer runner.

**Non-Goals:**
- Changing the VM detection rule itself.
- Adding configurable reminder thresholds or intervals in v1.
- Changing `/cron` subscription semantics.
- Introducing exact hypervisor event timestamps instead of poll-time observations.

## Decisions

### 1. `on -> on` uses a threshold-plus-interval reminder state machine

While persisted state is `on`, each polling invocation SHALL continue computing current uptime from the persisted/detected start time. The notification policy becomes:

- uptime `< 1 hour`: no runtime reminder
- uptime `>= 1 hour` and no prior runtime reminder: emit the first runtime reminder immediately
- uptime `>= 1 hour` and a prior runtime reminder exists: emit another reminder only when at least 10 minutes have elapsed since the last successful runtime reminder

This makes the policy stable under minute-based polling and avoids spamming.

Alternative considered:
- Notify only once after 1 hour: rejected because the user wants continued reminders.
- Notify on fixed wall-clock buckets like `:10/:20/:30`: rejected because the current polling system is naturally expressed as “10 minutes since last successful reminder.”

### 2. Runtime reminders need separate durable reminder metadata

The persisted `PDWin11MonitorState` SHALL be extended with dedicated runtime-reminder metadata, at minimum:

- `lastRuntimeReminderAt`

The existing lifecycle state (`off|on`, detected start time, transition time) remains authoritative for transition detection. Runtime reminder timing is tracked separately so:

- reminder cadence survives process restarts
- `off -> on` and `on -> off` lifecycle notifications remain distinct from “still running” reminders

Alternative considered:
- Reuse only the existing `lastNotificationAt`: rejected because it conflates lifecycle transitions with periodic runtime reminders and makes later reasoning harder.

### 3. Proactive monitor notifications become titled Feishu cards

`checkPDWin11` SHALL return notification intents that include both a title and a body. The outer runner continues to own delivery fan-out, but proactive notifications should render as informational Feishu cards rather than raw body-only messages.

The required titles are:

- `off -> on`: `MC 启动!`
- `on -> off`: `MC 下线!`
- runtime reminder: `MC 已运行 <formatted duration>`

Example runtime reminder titles:
- `MC 已运行 1小时`
- `MC 已运行 1小时20分`

Alternative considered:
- Keep body-only notifications: rejected because the user explicitly wants card-style notifications with stable titles.

### 4. Notification timestamps use a single host-local readable format

All `checkPDWin11` notification content SHALL format timestamps as:

- `YYYY/MM/DD HH:mm:ss`

using the bot host's local timezone. This applies to:

- startup time in `off -> on`
- shutdown time in `on -> off`
- startup time shown in runtime reminders

Alternative considered:
- Keep ISO timestamps: rejected because they are less readable in Feishu cards.
- Use locale-dependent free-form formatting: rejected because a fixed pattern is easier to test and reason about.

### 5. `on -> off` resets reminder cadence state

When the VM transitions from `on` to `off`, the persisted state SHALL clear or invalidate runtime-reminder timing so the next `off -> on -> on` cycle can schedule a fresh first-hour reminder.

This prevents stale reminder timing from leaking across distinct VM sessions.

Alternative considered:
- Preserve the old reminder timestamp after shutdown: rejected because it would suppress reminders incorrectly for the next boot cycle.

## Risks / Trade-offs

- [Minute-based polling may send a reminder slightly after the exact 1-hour mark] -> Treat the first poll that observes uptime `>= 1 hour` as the reminder trigger and document that precision bound.
- [Reminder titles and bodies can drift if duration formatting is inconsistent] -> Use one shared duration-formatting helper for summary, title, and body generation.
- [Older persisted rows will not have `lastRuntimeReminderAt`] -> Treat missing reminder metadata as “no reminder sent yet.”
- [Host-local timestamp formatting can differ from ISO-based test fixtures] -> Centralize formatting in a dedicated helper and cover it with deterministic tests.

## Migration Plan

1. Extend the `PDWin11MonitorState` model and SQLite persistence to support runtime-reminder metadata.
2. Update `checkPDWin11` to evaluate threshold-plus-interval reminder logic during `on -> on`.
3. Extend notification intents and Feishu delivery helpers to support titled cards.
4. Update tests, docs, and examples for the new titles and time format.

Rollback:
- Remove the runtime reminder branch and continue sending only lifecycle transition notifications.
- Ignore the additional persisted reminder metadata safely; older code can treat it as unused.

## Open Questions

- None for proposal scope. Threshold, interval, card titles, and timestamp format are all now decided.
