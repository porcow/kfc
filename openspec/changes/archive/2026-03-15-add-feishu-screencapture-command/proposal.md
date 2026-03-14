## Why

当前机器人已经支持文本命令驱动的任务执行，但缺少一个标准化的“截屏并回传” one-shot task。运维或远程协助场景下，用户希望通过现有 `/run ...` 流程触发一次截屏，并在确认后收到当前屏幕截图。

## What Changes

- 新增 one-shot task `sc`，授权用户通过 `/run sc` 触发，并沿用现有确认执行流程
- 新增 builtin-tool `screencapture` 约定：作为 task `sc` 的底层实现，截取当前屏幕并把图片回传到发起该命令的飞书会话
- 约定截图文件先落到 `$HOME/.kfc/data/screenshot-{datetime}.png`
- 约定图片发送成功后删除本地临时截图文件；发送失败时保留文件以便排查
- 更新 `/help` 与 `/tasks` 的展示，使用户能发现并使用 `/run sc`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: 增加 task `sc` 的可发现性与 `/run sc` 的交互行为
- `local-task-execution-audit`: 增加 task `sc` / builtin-tool `screencapture` 的执行、图片上传回传、成功后删除临时文件的要求

## Impact

- 受影响代码：
  - Feishu 任务发现、确认卡片与帮助文案
  - 本地任务执行入口与 builtin-tool 注册
  - Feishu SDK 文件上传/图片消息发送
  - 工作目录下截图文件的创建与清理
- 受影响系统：
  - macOS 屏幕截图命令
  - 飞书图片上传与消息发送接口
