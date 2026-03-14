# Design

## Overview

去重放在 Feishu SDK 入站 handler 最前面：

```text
Feishu event
  -> build ingress event key
  -> claim in bot-scoped SQLite dedup store
  -> if duplicate: log duplicate_suppressed and stop
  -> else: continue into handleMessage / handleCardAction
```

## Event Key Strategy

- `im.message.receive_v1`
  - 优先使用官方稳定事件标识，如 `header.event_id`、`event_id`、`message.message_id`
  - 如果没有稳定标识，则退化为 bot、chat、actor、message timestamp 和 normalized text 的组合键
- `card.action.trigger`
  - 优先使用官方稳定事件标识
  - 否则退化为 bot、`confirmationId|runId|taskId`、action type 和 actor 的组合键

## Storage

每个 bot 的 SQLite 增加 `ingress_dedup_events` 表：

- `event_key TEXT PRIMARY KEY`
- `event_type TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `expires_at TEXT NOT NULL`

实现采用短时 TTL 去重窗口，默认 15 分钟，并在 claim 前 opportunistic 清理过期记录。

## Handler Semantics

- 文本消息重复：
  - 不再进入 `handleMessage`
  - 不再发送回复卡片
  - 记录 `duplicate_suppressed`
- 卡片动作重复：
  - 不再进入 `handleCardAction`
  - 不再发送或返回重复卡片
  - 记录 `duplicate_suppressed`

## Relationship To Existing Idempotency

ingress dedup 只解决“相同入站事件被重复处理”的问题。  
现有的：

- confirmation -> run 幂等
- cron start 的运行态幂等

仍然保留，作为更深一层的业务防线。
