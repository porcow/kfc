# add-feishu-ingress-dedup

## Summary

为 Feishu 入站事件增加 bot 级持久化去重，避免 `im.message.receive_v1` 或 `card.action.trigger` 的重复投递导致机器人重复回复、重复执行业务逻辑或重复创建卡片响应。

## Motivation

当前实现会对每一次入站事件都直接执行业务逻辑并回复。当 Feishu 长连接或回调链路出现重复投递时，用户会在同一聊天里看到多次相同回复。

## Scope

- 为文本消息和卡片动作建立持久化 ingress dedup 存储
- 在 WS 和 HTTP 入站 handler 前置去重
- 对重复事件记录 `duplicate_suppressed` 决策日志
- 不改变现有任务、确认流或 run update 的业务语义

## Non-Goals

- 不改变 Feishu 上游投递策略
- 不把查询命令改成状态缓存回复
- 不替代已有的 run/confirmation 业务幂等保护
