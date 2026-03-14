## Context

当前机器人已经支持 `/tasks`、`/run`、`/cron`、`/health` 等飞书文本命令，也支持 builtin-tool 与 external-command 两类本地任务执行。为了保持 one-shot task 的一致交互，这次截屏能力应当复用既有 `/run ... -> confirm` 流程，而不是再引入一个独立命令面。

这个变更的目标是新增 one-shot task `sc`。授权用户通过 `/run sc` 发起请求，确认后执行底层 builtin-tool `screencapture`，先在本机生成截图文件，再通过飞书 SDK 回传到同一会话，发送成功后删除临时文件。

这个变更跨越 Feishu 命令面、builtin-tool 执行面和 Feishu 媒体发送面，适合先固定技术边界再实现。

## Goals / Non-Goals

**Goals:**

- 为授权用户新增 one-shot task `sc`
- 允许用户通过 `/run sc` 走标准确认流触发截图
- 将 task `sc` 固定绑定到底层 builtin-tool `screencapture`
- 使用 macOS 屏幕截图能力生成当前屏幕截图
- 将截图保存到 `$HOME/.kfc/data/screenshot-{datetime}.png`
- 使用飞书 SDK 把截图发送回发起命令的当前飞书会话
- 仅在图片发送成功后删除本地截图文件

**Non-Goals:**

- 不支持独立的 `/sc` 快捷命令
- 不支持任意 task id 的“截图别名”映射
- 不要求用户输入 `/run screencapture`
- 不支持区域截图、多屏选择、文件长期归档
- 不改变其他现有 task 的默认执行模型

## Decisions

### 1. 截图能力通过标准 `/run sc` one-shot 流程触发

用户面向的入口是 `/run sc`，并继续沿用既有 confirmation 流。这样能复用现有授权、审计、run 状态、结果查询和重复安全处理，而不是为截图能力单独开一套命令面。

备选方案：
- 新增独立 `/sc` 快捷命令并跳过确认
  - 拒绝原因：会引入 one-shot task 的例外流程，削弱命令面一致性

### 2. 用户可见 task id 为 `sc`，底层 builtin-tool 为 `screencapture`

用户交互层使用短 task id `sc`，底层实现名仍然是 `screencapture`。这样 `/run sc` 更自然，而内部实现仍能保持语义清晰。

备选方案：
- 直接把 task id 暴露成 `screencapture`
  - 拒绝原因：用户命令更长，收益不足

### 3. 截图实现使用 macOS `screencapture`

实现上应使用系统自带 `screencapture` 命令生成图片文件，而不是引入额外依赖或 GUI 自动化。文件命名使用主机本地时间戳，形如 `screenshot-YYYYMMDD-HHmmss.png`。

备选方案：
- 引入第三方截图库
  - 拒绝原因：增加依赖，收益不足

### 4. 图片回传目标是发起 `/run sc` 的当前 chat

“发送回指令的发送者”在当前系统里应收敛成：发送到该命令所在的当前飞书会话。原因是现有 bot 已可靠拿到 `chatId`，而不是单独的用户私聊上下文；同时这也符合用户在当前会话里请求截图、在当前会话里收到结果的心智模型。

备选方案：
- 发送给用户私聊而不是当前 chat
  - 拒绝原因：需要额外解析用户收件目标，且偏离当前交互模型

### 5. 删除策略是“发送成功后删除，发送失败则保留”

本地截图文件的生命周期分两步：
- 截图成功后保存在 `$HOME/.kfc/data/`
- 若飞书图片发送成功，则删除
- 若上传或发送失败，则保留文件以便排查，不做静默清理

备选方案：
- 无论成功失败都删除
  - 拒绝原因：发送失败时会丢失排障证据

## Risks / Trade-offs

- [主机无截图权限或无图形会话] → `screencapture` 可能失败；应把失败以清晰错误反馈返回给飞书用户
- [飞书媒体上传失败] → 截图文件会残留在 `$HOME/.kfc/data`；这是有意保留，用于排查
- [截图包含敏感信息] → 该命令仍应受现有授权模型保护，只允许 `allowed_users` 使用
- [文件名冲突] → 使用秒级时间戳通常足够；如实现时担心并发，可追加短随机后缀

## Migration Plan

1. 在 task registry 中引入 one-shot task `sc` 与 builtin-tool `screencapture`
2. 让 `/tasks`、`/help` 与 `/run` 识别并展示 `sc`
3. 打通 Feishu 图片上传/发送路径
4. 增加文档与手工验证步骤

无需数据迁移。回滚时删除 `/sc` 指令和 `screencapture` builtin-tool 即可。

## Open Questions

- 无。当前范围已足够进入实现。
