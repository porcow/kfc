## Why

Operators want the bot to detect when a Parallels Desktop Windows 11 VM on the host turns on or off and notify Feishu automatically, without waiting for a user to poll status manually. This is needed now because the existing task runner and cronjob framework can already host a stateful built-in monitoring tool, but there is no capability yet for durable host-observation state and transition-driven notifications.

## What Changes

- Add a new built-in tool `checkPDWin11.ts` that inspects the macOS process list for a Parallels Desktop Windows 11 VM instance.
- Add a durable `PDWin11State=off|on` state model for that tool so repeated polling runs can detect transitions instead of sending duplicate notifications.
- Add persistent storage of the last detected Windows 11 start time so shutdown notifications can include cumulative runtime.
- Add a fixed Feishu notification target to the tool configuration so the tool can push proactive transition notifications without an originating `/run` chat.
- Add transition rules for four cases: `off -> on`, `on -> on`, `on -> off`, and `off -> off`.
- Add notification behavior for `off -> on` and `on -> off` transitions, including detected start or shutdown time and computed runtime duration.
- Add documentation and verification guidance for running this tool as a cronjob task through the existing `/cron` and `kfc exec` paths.

## Capabilities

### New Capabilities
- `pd-win11-monitoring`: Stateful monitoring of a Parallels Desktop Windows 11 VM with transition-driven Feishu notifications.

### Modified Capabilities
- None.

## Impact

- Affects built-in tool scripts under `tools/` and the controlled execution path for built-in tasks.
- Introduces persistent tool-specific monitor state in the per-bot SQLite store.
- Introduces task configuration for the Windows 11 VM display name match and proactive Feishu notification destination.
- Uses the existing Feishu bot client to send proactive informational messages without an interactive request origin.
- Depends on macOS host process inspection semantics and Parallels process naming remaining stable enough for substring matching.
