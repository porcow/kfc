## Why

Teams need a controlled way to trigger recurring operations work from chat without opening shell access to operators. A Feishu bot that runs only pre-registered tasks on its host machine gives faster response, clearer auditability, and lower risk than ad hoc remote login.

## What Changes

- Add a Feishu IM bot entrypoint that can receive events, validate signatures, and reply with task-oriented interactive messages.
- Add support for a single process to host multiple Feishu bot instances, each with its own credentials, task registry, and runtime state.
- Add a configuration-driven task registry with allowed Feishu users, task metadata, runner kind, execution mode, parameter schema, timeout, and cancellation policy.
- Add support for a task model that separates runner kind (`builtin-tool` or `external-command`) from execution mode (`oneshot` or `cronjob`).
- Add support for launchd-managed cronjob tasks, including Feishu `/cron list|start|stop|status` commands and cron-expression-driven schedule configuration.
- Add a controlled configuration lifecycle so task changes become effective only after an explicit reload action or a controlled service restart.
- Add a pairing-based authorization path so unauthorized Feishu users receive a one-time local admin command `kfc pair <pair_code>` that can add them to the bot's `allowed_users`.
- Add a unified local `kfc` CLI for launchd-backed service installation, lifecycle management, local pairing, and controlled direct task execution on macOS.
- Add a local execution runtime for macOS that launches only predefined built-in tools or configured external commands, tracks task lifecycle, and streams status back to Feishu.
- Add run history persistence so each execution has a stable `run_id`, operator identity, timestamps, status, parameter summary, and result summary.
- Add cronjob state persistence so each managed launchd-backed task has durable desired and observed state that can be inspected independently from one-shot runs.
- Add user flows to list one-shot tasks with example commands, submit task parameters through structured text commands, confirm execution from a confirmation card, manage cronjobs with `/cron`, watch progress, and query recent run details by `run_id`.

## Capabilities

### New Capabilities
- `feishu-task-interaction`: Feishu-based task discovery, authorization, confirmation, progress, and run lookup workflows.
- `local-task-execution-audit`: Local predefined task execution, lifecycle control, and durable audit records for each run.

### Modified Capabilities
- None.

## Impact

- Adds a new bot service surface that integrates with Feishu event callbacks and card/message updates.
- Introduces multi-bot TOML configuration for authorized users, Feishu credentials, task definitions, and controlled task-registry reload behavior.
- Introduces a local `kfc` admin CLI plus per-bot pairing records for immediate authorization onboarding without service restart.
- Introduces per-bot persistent run history stores and execution logs on the bot host.
- Introduces launchd-backed cronjob management, persisted cronjob state, and a host-local service lifecycle managed through the same `kfc` CLI, including explicit install and uninstall of the main service plist.
- Requires runtime dependencies for HTTP handling, Feishu API integration, child process management, local persistence, and TOML configuration parsing.
