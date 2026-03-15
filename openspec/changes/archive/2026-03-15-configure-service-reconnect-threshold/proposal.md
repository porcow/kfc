## Why

当前 `service_reconnected` 的离线窗口阈值直接写死在实现里，且默认值是 5 分钟。这有两个问题：

- 运维策略无法通过配置调整，只能改代码
- 阈值语义属于 service 级运行时策略，而不是某个 bot 私有行为

现在希望把它提升为 service 级全局配置，所有 bot 统一继承，并把默认策略改为 10 分钟。

## What Changes

- 在全局 `[server]` 配置下新增 `service_reconnect_notification_threshold_ms`
- `service_reconnected` 的最小离线时长阈值不再硬编码，改为读取该全局配置
- 默认阈值从 5 分钟调整为 10 分钟（`600000` ms）
- 更新示例配置与相关文档，在配置项旁明确注释单位为 `ms`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: `service_reconnected` 的触发阈值改为由 service 级全局配置控制，默认 10 分钟

## Impact

- 受影响代码：
  - 全局配置模型与 TOML 解析
  - WebSocket 连接恢复通知判定
  - 示例配置与运维文档
- 行为影响：
  - 未显式配置时，恢复通知比现在更保守，短于 10 分钟的 outage 不再触发 `service_reconnected`
  - 所有 bot 共享同一个阈值，不支持单 bot override
