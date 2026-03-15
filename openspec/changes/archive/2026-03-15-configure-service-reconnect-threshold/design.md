## Context

当前 bot 连接事件通知已经区分：

- `service_online`：进程 session 内首次连上
- `service_reconnected`：经历 outage 后恢复连接

其中 `service_reconnected` 使用固定 5 分钟阈值过滤短暂网络抖动。这个策略在语义上属于 service 运行时行为，和端口、健康检查路径一样，对所有 bot 统一生效更符合现有模型。

## Decision

### 1. 阈值提升为全局 `server` 配置

在 `[server]` 下新增：

```toml
service_reconnect_notification_threshold_ms = 600000
```

特点：

- service 级全局配置
- 所有 bot 直接继承
- 第一版不支持 bot 级 override

### 2. 默认值改为 10 分钟

未配置时，系统默认使用 `600000` ms，即 10 分钟。

这比当前 5 分钟更保守，更符合“只在较明确的服务恢复后提醒一次”的目标。

### 3. 单位保持与现有超时风格一致

字段名使用 `_ms` 后缀，和现有 `timeout_ms` 一致，避免再引入分钟/秒的换算约定。

示例配置和文档中的注释需要明确说明：

- 单位为毫秒（ms）

## Risks / Trade-offs

- [阈值变大导致恢复通知变少] → 这是有意为之，默认策略从“较敏感”改成“较保守”
- [全局配置无法覆盖单 bot 特例] → 当前需求明确要求所有 bot 继承，先不引入 override 复杂度
- [配置值单位误解] → 通过 `_ms` 命名和配置注释双重强调

## Implementation Shape

```text
config.toml
  [server]
  service_reconnect_notification_threshold_ms
            │
            ▼
GlobalServerConfig
            │
            ▼
BotManager / bridge construction
            │
            ▼
processServiceConnectionTransition(...)
            │
            ├─ outage < threshold  -> no service_reconnected
            └─ outage >= threshold -> emit service_reconnected
```

## Open Questions

- 无。范围明确，且不需要额外能力拆分。
