## Context

当前系统已经维护了每个 bot 的 Feishu WebSocket 健康状态，并通过 `/health` 暴露 `connected`、`reconnecting`、`disconnected` 等状态，但这些状态只用于查询，不会形成主动通知。另一方面，现有主动通知模型主要围绕 run 更新和 cron 监控通知，目标大多是 `chat_id`，尚未覆盖“服务级事件”以及“默认通知到 allowlist 用户私聊”。

用户要解决的问题不是“查询当前健康状态”，而是“当机器重启、重新登录、从休眠恢复，或者长连接经历较长时间掉线后恢复时，机器人主动告诉订阅者自己重新可用了”。这更像 service lifecycle / connection lifecycle 事件，而不是 task result。

## Goals / Non-Goals

**Goals:**

- 定义两类服务连接事件：`service_online` 与 `service_reconnected`
- 让 `service_online` 以**当前进程 session 内首次 successful connected** 为准，而不是 bot 全历史只发一次
- 让 `service_reconnected` 只在离线窗口超过阈值后才通知，避免抖动刷屏
- 新增持久化订阅表和连接事件状态表
- 让 `allowed_users` 自动同步成默认订阅
- 扩展主动 Feishu 发送能力，支持以用户私聊为目标

**Non-Goals:**

- 不为服务连接事件新增飞书命令面订阅/退订管理
- 不把短暂 reconnect 抖动全部做成通知
- 不改变 `/health` 的 canonical snapshot 角色
- 不把这类通知混入 run history 或 cron runtime state

## Decisions

### 1. 事件分为 `service_online` 和 `service_reconnected`

`service_online` 定义为：
- bot 所属服务进程启动后
- 当前 bot runtime 首次 successful connected

`service_reconnected` 定义为：
- bot 曾从 `connected` 进入 `reconnecting/disconnected`
- 形成离线窗口
- 离线时长达到阈值
- 然后重新 `connected`

这样可以区分“开机/登录后首次上线”和“运行中掉线后恢复”。

### 2. `service_online` 的去重使用进程内 session 状态

`service_online` 不做永久历史去重，而是每个 bot runtime 维护进程内布尔状态，例如：
- `onlineNotificationSent`

这样：
- 当前进程 session 首次 connected 时通知一次
- 进程重启后可以再次通知

备选方案：
- 把 `online_notified_at` 永久写进 SQLite
  - 拒绝原因：会让 bot 只在全历史第一次上线时通知，和“重启后再次上线通知”的目标冲突

### 3. `service_reconnected` 依赖持久化的离线窗口状态

新增 `service_event_state`，每个 bot 一条记录，至少包含：
- `bot_id`
- `last_connected_at`
- `last_disconnected_at`
- `last_reconnected_notified_at`
- `updated_at`

`last_disconnected_at` 的语义是：
- **本次离线窗口的起点**
- 只在 `connected -> reconnecting/disconnected` 的首次离线转移时写入
- 后续重试中不重复覆盖

### 4. 重连通知阈值第一版固定为 5 分钟

只有当：
- `recovered_at - last_disconnected_at >= 5 minutes`

才发 `service_reconnected`。  
这能过滤短暂网络抖动和 SDK 短重试。

### 5. 订阅模型持久化为显式表，但默认源自 `allowed_users`

新增：
- `service_event_subscriptions`
  - `bot_id`
  - `actor_id`
  - `event_type`
  - `enabled`
  - `created_at`
  - `updated_at`

启动或 reload 时：
- 新增到 `allowed_users` 的 actor 自动补订阅
- 从 `allowed_users` 移除的 actor 自动移除订阅

这样第一版无需命令面，也能保证授权和通知范围一致。

### 6. 通知目标使用用户私聊，而不是 chat 订阅

因为默认订阅者是 `allowed_users`，第一版应扩展 Feishu 主动消息发送能力，使其支持用户维度目标，例如：
- `receive_id_type = open_id`
- `receive_id = actor_id`

这与当前 cron 通知的 `chat_id` fan-out 是不同路径，应共用发送层但支持不同目标类型。

### 7. 通知内容保持简洁并复用现有时间格式规范

`service_online` 建议内容：
- 标题：`Bot 已上线`
- 正文包含：
  - bot id
  - connected at
  - host
  - loaded at（可选）

`service_reconnected` 建议内容：
- 标题：`Bot 已恢复连接`
- 正文包含：
  - bot id
  - reconnected at
  - outage duration
  - host

所有面向飞书聊天界面的时间继续用 `YYYY/MM/DD HH:mm:ss`。

## Risks / Trade-offs

- [SDK 日志噪声导致错误触发] → 只在明确状态转移时触发事件，避免直接按每条日志发通知
- [用户私聊发送依赖 actor id 类型] → 明确要求第一版使用可被 Feishu 私聊消息接口接受的 actor/open_id 标识
- [allowlist 频繁变化导致订阅 churn] → 在 reload 时做幂等 reconcile，而不是盲目重建
- [服务恢复频繁抖动刷屏] → 通过 5 分钟阈值和 `last_reconnected_notified_at` 约束

## Migration Plan

1. 新增 bot 级服务事件订阅和状态表
2. 在 bot startup / reload 时把 `allowed_users` reconcile 为默认订阅
3. 扩展 Feishu 主动消息发送目标类型
4. 在 WebSocket bridge 外层增加状态迁移检测和通知触发
5. 补充测试与文档

回滚方式：关闭状态迁移通知触发，保留 `/health` 查询能力不变。

## Open Questions

- 无。当前范围足够进入实现。
