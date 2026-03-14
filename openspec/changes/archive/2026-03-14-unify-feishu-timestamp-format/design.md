## Context

当前系统已经同时存在两类 Feishu 时间戳展示：
- run 状态卡片、健康信息等仍可能直接显示 ISO 风格字符串
- `checkPDWin11` 的通知内容已经要求使用更易读的本地时间格式

这导致同一聊天里的时间字段风格不一致。该变更是一个跨多个 Feishu 出站路径的展示层收敛：run cards、`/health` 回复、监控通知卡片都要使用同一个时间字符串格式。

## Goals / Non-Goals

**Goals:**
- 为所有发往 Feishu 的人类可读时间戳定义唯一展示格式 `YYYY/MM/DD HH:mm:ss`
- 复用同一套格式化逻辑，避免不同 card builder 各自处理时间
- 只改变 Feishu 聊天界面的出站展示，不改变数据库存储、内部状态机、日志、外部 HTTP `/health` 的原始 JSON 结构，或机器人服务与 Feishu 服务端 API 通信中的协议时间戳

**Non-Goals:**
- 不改变 SQLite 中保存的 ISO 时间戳
- 不改变内部运行时比较、超时计算、提醒节流等逻辑使用的时间表达
- 不为本地 CLI 或 HTTP `/health` 原始 JSON 引入新的格式化约束，除非它们明确进入 Feishu 展示层
- 不改变机器人服务与 Feishu 服务端 API 请求、响应、回调载荷中使用的原始时间戳字段

## Decisions

### Introduce a single Feishu timestamp formatter
所有发往 Feishu 的人类可读时间字符串都应通过一个共享格式化函数生成，输出固定为主机本地时区的 `YYYY/MM/DD HH:mm:ss`。

Rationale:
- 统一展示层 contract，避免 run/status/health/monitoring 各自漂移
- 保留内部 ISO 持久化，最小化行为变化范围

Alternative considered:
- 在每个 card builder 里各自格式化。Rejected，因为容易再次出现风格漂移。

### Keep canonical source data unchanged and format only at render time
run 记录、monitor 状态、健康快照等仍然保留现有原始时间字段；只有在组装 Feishu 文本或卡片时才格式化。

Rationale:
- 避免存储迁移
- 不影响现有比较逻辑和测试中依赖 ISO 时间的部分

Alternative considered:
- 全系统把时间都改成统一字符串。Rejected，因为会把展示层问题扩散到持久化和内部逻辑。

### Apply the rule to both cards and plain command replies delivered through Feishu
该格式约束覆盖所有通过 Feishu 通道送达的内容，不区分是 interactive card 还是命令回复文本片段。

Rationale:
- 用户视角只关心“机器人发来的内容”，不关心底层载体
- 能覆盖 `/health`、run cards、监控通知等全部主要路径

### Exclude protocol-layer timestamps from the display rule
该规则只约束最终显示在 Feishu 聊天界面中的人类可读时间字符串，不约束机器人服务与 Feishu 服务端 API 通信过程中使用的协议字段。

Rationale:
- 协议字段面向机器处理，不是用户阅读界面
- 避免把展示层规范错误扩展到 SDK、HTTP payload 或事件载荷

## Risks / Trade-offs

- [某些字段当前没有明确区分“展示时间”与“原始时间”] → 通过共享 formatter 明确只有 Feishu 出站路径才做格式化
- [主机本地时区可能与用户所在时区不同] → 继续沿用当前系统“主机本地时间”语义，保持所有 Feishu 内容一致
- [已有测试可能断言旧的 ISO 字符串] → 统一更新到 canonical display format，保留内部 store tests 不变

## Migration Plan

1. 引入共享 Feishu 时间格式化函数
2. 将 run status cards、`/health` Feishu 回复、monitor notifications 切到该 formatter
3. 更新测试和手工验证文档，统一断言 `YYYY/MM/DD HH:mm:ss`
4. 不做数据迁移；已有持久化数据在下一次渲染时自然以新格式显示

## Open Questions

None.
