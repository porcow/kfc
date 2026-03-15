## Why

当前 `sc` 是在配置加载阶段自动注入到每个 bot 的隐式任务。这让截图能力偏离了“bot 能做什么完全由本地 task 配置决定”的原则，也让截图这种带宿主能力和安全敏感性的任务默认暴露给所有 bot。

## What Changes

- **BREAKING**: 移除对 one-shot task `sc` 的自动注入；只有显式配置了 `[bots.<id>.tasks.sc]` 的 bot 才能使用 `/run sc`
- 保留 `sc` 作为受保护的预定义 task id；当配置了 `sc` 时，仍然要求它必须绑定为 `builtin-tool + oneshot + screencapture`
- 更新 `/tasks`、`/help` 和 `/run sc` 的语义，使它们只在 bot 已显式启用 `sc` 时暴露或接受该任务
- 更新示例配置和文档，要求想启用截图能力的 bot 明确声明 `tasks.sc`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: `/run sc` 与任务发现改为依赖 bot 的显式 `tasks.sc` 配置
- `local-task-execution-audit`: `sc` 从“所有 bot 预定义可用”改为“只有显式配置时才可执行”，同时保留其受保护的预定义绑定约束

## Impact

- 受影响代码：
  - 配置解析与 task registry 组装
  - `/tasks`、`/help`、`/run` 对 `sc` 的暴露与校验
  - 示例配置与 README、手工验证文档
- 兼容性影响：
  - 现有未显式配置 `tasks.sc` 的 bot 将失去 `/run sc` 能力，直到在 TOML 中添加该任务定义
