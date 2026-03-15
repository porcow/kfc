## Context

当前实现会在配置加载阶段自动向每个 bot 注入 one-shot task `sc`。这使截图能力成为隐式行为，而不是显式配置的一部分。与现有系统“任务目录由 `[bots.<id>.tasks]` 决定”的模型相比，这个例外让 task discovery、权限暴露和文档心智变得不一致。

截图能力已经有固定的底层约束：task id 必须是 `sc`，runner 必须是 `builtin-tool`，execution mode 必须是 `oneshot`，tool 必须是 `screencapture`。这说明 `sc` 更适合作为“保留 task id 的显式配置项”，而不是“所有 bot 自动拥有的隐式任务”。

## Goals / Non-Goals

**Goals:**

- 取消 `sc` 的自动注入，恢复“task 只能来自显式配置”的原则
- 保留 `sc` 的预定义绑定约束，防止把 `sc` 重新映射到其他 runner 或 tool
- 让 `/tasks`、`/help` 和 `/run sc` 与 bot 的显式配置保持一致
- 为需要截图能力的 bot 提供清晰的启用方式：显式配置 `[bots.<id>.tasks.sc]`

**Non-Goals:**

- 不改变 `screencapture` builtin-tool 的具体实现
- 不引入新的截图 task id 或别名
- 不放宽 `sc` 的绑定约束
- 不改变其他预定义或普通 task 的配置规则

## Decisions

### 1. `sc` 改为显式配置，不再自动注入

配置解析阶段不再在 `tasks.sc` 缺失时补一个默认任务。这样 `bot.tasks` 只反映 TOML 中真实声明的任务集合。

备选方案：
- 继续自动注入，再增加一个“禁用 sc”开关
  - 拒绝原因：会让同一个能力同时存在隐式注入和显式禁用两套机制，复杂度更高

### 2. `sc` 继续作为受保护的保留 task id

虽然 `sc` 需要显式配置，但一旦配置，仍然必须满足：
- `runner_kind = "builtin-tool"`
- `execution_mode = "oneshot"`
- `tool = "screencapture"`

这样可以同时获得：
- 显式启用
- 固定语义
- 避免用户把 `sc` 重绑定到其他任务

备选方案：
- 把 `sc` 完全变成普通 task id
  - 拒绝原因：会破坏 `/run sc` 的稳定语义，也会让文档和操作习惯不稳定

### 3. 飞书命令面只反映已配置任务

`/tasks` 只展示当前 bot 显式配置的 `sc`；`/help` 不再宣称所有 bot 都有 `/run sc`，而是改成条件性提示；未配置 `sc` 的 bot 上 `/run sc` 应回到标准未知任务错误。

备选方案：
- `/help` 继续总是显示 `/run sc`
  - 拒绝原因：会让用户看到一个当前 bot 实际不可用的命令

## Risks / Trade-offs

- [现有 bot 依赖隐式 `sc`] → 升级后会出现 `/run sc` 不可用；通过更新示例配置、README 和错误反馈降低迁移成本
- [文档与实现不一致] → 需要同步修改示例配置、帮助文案和测试，防止还保留“always available”表述
- [用户误配 `sc`] → 继续保留严格校验，明确报出 `sc` 必须绑定到 `screencapture`

## Migration Plan

1. 停止在配置解析阶段自动注入 `sc`
2. 保留并复用 `sc` 的预定义绑定校验
3. 将示例配置改为真正显式声明 `tasks.sc`
4. 更新 `/help`、`/tasks`、README 和手工验证文档

回滚方式：恢复自动注入逻辑，并允许 bot 在未配置 `tasks.sc` 时继续暴露该任务。

## Open Questions

- 无。当前变更范围明确。
