## Why

当前发往飞书的内容里，时间戳格式并不统一：有些字段是 ISO 字符串，有些已经改成了更可读的本地格式。这会让 run 状态卡片、健康信息和监控通知在同一个聊天里表现不一致，增加阅读成本。

## What Changes

- 统一所有发往飞书通道的时间戳展示格式为 `YYYY/MM/DD HH:mm:ss`
- 将 one-shot run 状态卡片中的时间字段纳入统一格式约束
- 将 `/health` 和其他 Feishu 命令回复中的时间字段纳入统一格式约束
- 保持本地持久化和内部计算仍可使用现有 ISO / 原始时间格式；统一只作用于 Feishu 聊天界面的出站展示层，不改变机器人服务与 Feishu 服务端 API 通信过程中使用的协议时间戳

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: all Feishu replies and cards must render human-facing timestamps in a single canonical format
- `pd-win11-monitoring`: proactive Windows 11 lifecycle and runtime reminder notifications must follow the same canonical Feishu timestamp format
- `local-task-execution-audit`: Feishu-facing run cards derived from persisted run data must render timestamps in the canonical display format

## Impact

- Affected code: Feishu card builders, health response rendering, run status rendering, and monitor notification rendering
- APIs: Feishu-visible time fields change presentation format but not meaning
- Systems: Feishu users see a consistent local-time timestamp style across command replies, run updates, and proactive monitoring cards
