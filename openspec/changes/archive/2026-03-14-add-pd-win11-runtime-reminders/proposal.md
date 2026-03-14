## Why

`check-pd-win11` 现在只在 `off -> on` 和 `on -> off` 时发送纯文本通知，无法覆盖“Windows 11 已持续运行较长时间”的运维提醒场景，也没有稳定的卡片标题和易读时间格式。现在需要把这条监控通知收敛成更清晰的 Feishu 卡片契约，并增加 1 小时后每 10 分钟一次的持续运行提醒。

## What Changes

- Extend `checkPDWin11` so `on -> on` continues evaluating uptime on every poll and emits a runtime reminder once uptime first exceeds 1 hour.
- Add repeating runtime reminders every 10 minutes after the first 1-hour reminder while the VM remains `on`.
- Change `checkPDWin11` proactive Feishu notifications from body-only messages to card-style notifications with explicit titles.
- Standardize `checkPDWin11` notification timestamps to readable `YYYY/MM/DD HH:mm:ss` host-local formatting.
- Persist reminder timing metadata so minute-level cron polling does not spam duplicate runtime reminders across repeated invocations or service restarts.

## Capabilities

### New Capabilities
- `pd-win11-monitoring`: Defines the `checkPDWin11` monitoring state machine, lifecycle notifications, runtime reminder policy, and readable timestamp formatting.

### Modified Capabilities
- `feishu-task-interaction`: Proactive monitoring notifications now render as titled Feishu cards rather than body-only text payloads.
- `local-task-execution-audit`: Built-in tool notification intents and persisted monitor state now carry the metadata needed for periodic runtime reminders.

## Impact

- Affected code:
  - `src/tools/checkPDWin11.ts`
  - `src/domain.ts`
  - `src/persistence/run-repository.ts`
  - `src/kfc.ts`
  - Feishu card rendering helpers
- Affected persistence:
  - `pd_win11_states` durable state schema/content
- Affected docs/tests:
  - tool tests
  - README and manual verification
