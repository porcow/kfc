## Why

当前主服务已经支持 `install`、`restart`、`health` 和 `uninstall`，但版本升级仍依赖操作员手工 `git pull`、重新安装和重启服务。对于已部署的机器人，这会让日常升级路径不一致，也无法通过飞书入口完成同一套受控更新流程。

## What Changes

- 增加本地 CLI 更新入口 `kfc update`
- 增加飞书更新入口 `/run update`，并沿用标准 one-shot confirmation 流
- 新增主服务自我更新流程：检查更新、确认、拉取最新代码、执行安装、返回当前版本信息
- 定义“无更新可用”时的稳定反馈，避免误执行安装
- 统一 CLI 与飞书两条入口的更新语义与结果信息

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `feishu-task-interaction`: 增加 `/run update` 的交互、确认和结果反馈要求
- `local-task-execution-audit`: 增加 `kfc update` 与受控自更新执行、版本检查和结果审计要求

## Impact

- 受影响代码：
  - `src/kfc.ts`
  - `src/service.ts`
  - `src/feishu/cards.ts`
  - `src/config/schema.ts`
  - 可能新增更新执行/版本读取模块
- 受影响系统：
  - 本地 git 工作树
  - 安装目录与 launchd 服务重装流程
  - 飞书确认流与 run 状态反馈
