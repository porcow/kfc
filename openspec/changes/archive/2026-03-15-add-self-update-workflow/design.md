## Context

当前系统已经有两套本地控制面：
- 顶层 CLI `kfc ...`
- 飞书命令面 `/run ...`

其中，`/run` 已经提供标准 one-shot confirmation、run audit 和结果回传；`kfc` 已经提供 `service install/restart/stop/uninstall` 等受控本地运维接口。自更新如果独立成第三套流程，会让升级路径和权限边界再次分裂。因此这次设计把“检查更新 + 确认更新 + 执行更新 + 返回版本”同时挂到：
- `kfc update`
- `/run update`

更新目标假定为本机部署的 git 工作树，并复用已有安装流程完成“更新后重新安装/重启”。

## Goals / Non-Goals

**Goals:**
- 提供统一的主服务自更新工作流
- 让 CLI 与飞书入口都能走通同一套更新语义
- 在真正执行更新前先检查是否有更新可用
- 对飞书入口复用现有 one-shot confirmation 和 run 审计模型
- 更新完成后返回稳定版本信息

**Non-Goals:**
- 不支持版本回滚
- 不支持选择任意 tag、branch 或 commit 升级
- 不处理依赖 lockfile 之外的复杂迁移策略
- 不在本次变更中解决多实例或集群滚动升级

## Decisions

### 1. 更新入口分成 CLI 和 one-shot task 两层

CLI 入口：
- `kfc update`

飞书入口：
- `/run update`

其中 `/run update` 不是特殊命令，而是标准 oneshot task：
- task id = `update`
- runner_kind = `builtin-tool`
- execution_mode = `oneshot`

这样飞书路径天然复用：
- 参数校验
- 确认卡片
- run id
- 审计与状态查询

### 2. `update` task 不自动注入，每个 bot 需要显式配置

和 `sc` 的收敛方向保持一致：
- 只有显式声明了 `tasks.update` 的 bot，才能使用 `/run update`

同时保留 task id 约束：
- `id = update`
- `runner_kind = "builtin-tool"`
- `execution_mode = "oneshot"`
- `tool = "self-update"`

拒绝任意 bot 默认暴露升级能力，避免无意放开高风险运维动作。

### 3. 更新流程固定为“先检查，再确认/执行”

统一流程：
1. 检查当前工作树是否存在远端新版本
2. 如果无更新：
   - 返回“当前已是最新版本”
   - 不继续执行安装
3. 如果有更新：
   - CLI 走本地确认
   - 飞书走 `/run` 标准确认流
4. 确认后执行：
   - 拉取最新代码
   - 执行安装步骤
   - 返回当前版本信息

CLI 和飞书的主要区别仅在于确认媒介不同。

### 4. 更新来源以当前 git remote 为准，版本信息以 git commit 为准

第一版不引入发布服务或 release manifest。

检查更新：
- 基于当前工作树所在仓库的已配置 remote
- 通过 fetch + 比较本地 HEAD 与远端跟踪分支判断是否有更新
- 只接受 **fast-forward** 更新
- 若本地分支领先远端、与远端分叉、或无法形成 fast-forward，则阻止更新

版本信息：
- 至少包含当前 commit short SHA
- 如果可获得 branch 名，也一并返回

采用 git commit 作为版本表达比自定义应用版本号更稳，因为当前项目就是从 git 仓库部署。

### 5. 更新执行分为检查层和执行层

实现上分成两个内部层次：

- `inspectUpdateState()`
  - 检查 git 工作树是否可更新
  - fetch 远端引用
  - 比较 `HEAD` 与 upstream
  - 返回：
    - `up_to_date`
    - `update_available`
    - `blocked`
- `performSelfUpdate()`
  - 在 `inspectUpdateState()` 已确认可更新后执行
  - 负责 pull、安装、刷新服务托管状态

`kfc update` 和 builtin-tool `self-update` 都应复用这两个内部层次，而不是各自实现一套流程。

### 6. 更新执行复用现有安装语义，而不是仅做 restart

确认更新后，执行面固定为：
- 拉取最新代码
- 安装依赖/刷新本地安装
- 重新确保服务处于最新托管状态，并复用 `kfc service install` 语义

设计上应复用现有安装语义，避免形成两套“安装完成状态”：
- `install.sh`
- `kfc service install`

这里不选择“只做 `kfc service restart`”，因为 update 的目标不是单纯重启代码，而是把部署态收敛到当前版本所要求的正式安装状态，包括：
- 主服务 plist
- 环境变量
- launchd 托管配置

实现上更推荐直接复用 TypeScript 内部的 service-install 逻辑，而不是在更新过程中再次 shell 调完整 CLI。

### 7. 飞书更新结果仍走 run 状态卡片，不额外发明专用结果通道

`/run update` 的结果应写入 run summary，并能通过：
- 确认后的状态卡片
- `/run-status <run_id>`

查看。

如果“有更新并完成更新”，结果 summary 应至少包含：
- 更新完成
- 从哪个 commit 更新到哪个 commit
- 当前版本

如果“已经最新”，summary 应明确写：
- 当前已是最新版本

### 8. CLI 更新需要交互确认，并正式支持 `--yes`

第一版用户需求是：
- `kfc update`
- `kfc update --yes`

因此 CLI 默认应交互确认：
- 检查到有更新时提示 `Continue? [y/N]`

`--yes` 的语义仅为：
- 跳过本地确认提示

它**不**表示强制覆盖，也不跳过：
- git 仓库状态检查
- dirty worktree 检查
- upstream 检查
- fetch
- fast-forward 可更新性判断

### 9. 更新前置条件必须可诊断

这些情况都必须返回明确错误，而不是半途失败：
- 当前目录不是 git 工作树
- 未配置远端跟踪分支
- 工作树有本地未提交修改且策略不允许覆盖
- 本地分支领先远端
- 本地分支与远端分叉
- fetch / pull 失败
- 安装步骤失败

其中“工作树有本地修改”第一版建议直接阻止更新，避免隐式覆盖。

## Risks / Trade-offs

- [工作树有本地改动或分叉状态导致更新失败] → 在检查阶段显式阻止并返回诊断信息
- [飞书入口触发高风险运维动作] → 仅允许显式配置了 `update` task 的 bot 使用，并复用标准确认流
- [更新过程中服务重启影响当前执行上下文] → 以持久化 run summary 为结果源，允许更新完成后再查询最终状态
- [git remote 或跟踪分支配置不一致] → 第一版严格依赖当前仓库 git 配置，不尝试自动推断更多来源

## Migration Plan

1. 新增 `self-update` builtin-tool 以及 `inspectUpdateState()` / `performSelfUpdate()` 模块
2. 新增 `kfc update` CLI 入口
3. 支持显式配置 `tasks.update`
4. 在飞书中通过 `/run update` 暴露升级能力
5. 补充文档与手工验证步骤

回滚方式：
- 不执行新更新入口即可回到旧运维方式
- 如需撤销代码层变更，可按已有 git/部署方式回退到旧 commit 再重新安装

## Open Questions

- 无。当前范围足够进入实现。
