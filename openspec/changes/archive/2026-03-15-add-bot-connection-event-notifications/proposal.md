## Why

当前系统能通过 `/health` 反映 bot 与飞书长连接的健康状态，但它不会在机器人重新上线或长连接恢复后主动通知运维用户。对于依赖这台 macOS 机器长期在线提供机器人能力的场景，这使“机器重启/重新登录后 bot 已恢复可用”只能靠人工查询确认。

## What Changes

- 新增两类 bot 连接事件通知：
  - `service_online`：当前服务进程 session 内首次成功连接飞书
  - `service_reconnected`：运行中的进程在离线窗口超过阈值后重新连接飞书
- 新增服务级订阅模型 `service_event_subscriptions`
- 默认以 `allowed_users` 作为订阅源，并把它们同步成显式订阅记录
- 新增服务级状态模型 `service_event_state`，用于持久化掉线窗口与重连通知去重
- 将主动 Feishu 通知从仅支持 `chat_id` 扩展到支持用户私聊发送
- 对 `service_reconnected` 引入最小离线时长阈值，避免网络抖动刷屏

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: 增加 bot 上线/重连的主动 Feishu 通知行为，并要求使用用户私聊作为默认通知目标
- `local-task-execution-audit`: 增加 bot 连接事件订阅、持久化状态、allowlist 同步规则，以及长连接状态迁移触发通知的要求

## Impact

- 受影响代码：
  - Feishu WebSocket bridge 的状态迁移处理
  - 主动 Feishu 消息发送能力
  - bot 级 SQLite 持久化结构
  - 配置 reload 时的 allowlist → 订阅同步
- 受影响系统：
  - 飞书用户私聊消息发送
  - WebSocket 健康状态与重连时序
