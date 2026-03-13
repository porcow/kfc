## 1. Feishu Bot Foundation

- [x] 1.1 Create the Feishu bot service entrypoint, callback endpoint, and request signature verification flow.
- [x] 1.2 Implement Feishu message or card handlers for listing tasks, collecting parameters, and sending confirmation prompts.
- [x] 1.3 Add duplicate-action protection so retried confirmations reuse the same run instead of creating another one.

## 2. Local Configuration And Authorization

- [x] 2.1 Define the TOML configuration schema for `allowed_users`, task definitions, task types, parameter rules, timeouts, and cancellation policy.
- [x] 2.2 Implement configuration loading and validation at startup with clear failure handling for invalid task declarations and unsupported task types.
- [x] 2.3 Enforce allowed-user checks on every Feishu action before exposing task details or accepting execution requests.
- [x] 2.4 Implement explicit task-registry reload handling and controlled-restart activation behavior so configuration edits do not take effect implicitly.

## 3. Task Execution Runtime

- [x] 3.1 Implement confirmed-run creation with stable `run_id` generation and persisted lifecycle state transitions.
- [x] 3.2 Define and implement the pluggable built-in task interface for tools under `tools/` and route `builtin-tool` task definitions through it.
- [x] 3.3 Implement the external-command executor that launches configured binaries or scripts on macOS and captures exit status and result summaries.
- [x] 3.4 Unify built-in and external-command execution behind one run-lifecycle contract and result model.
- [x] 3.5 Enforce timeout and cancellation behavior, including rejection of cancellation for non-cancellable tasks.

## 4. Audit And Status Reporting

- [x] 4.1 Add durable run-history storage for initiator, task, parameter summary, timestamps, status, and result summary.
- [x] 4.2 Implement Feishu status updates for running and completed tasks plus lookup by `run_id`.
- [x] 4.3 Reconcile persisted runs on startup so previously recorded executions remain queryable after restart.

## 5. Verification And Documentation

- [x] 5.1 Add tests for whitelist enforcement, parameter validation, duplicate confirmation handling, reload activation rules, timeout behavior, cancellation rules, and restart-safe run lookup.
- [x] 5.2 Add an integration test or documented manual verification flow for Feishu callback handling and end-to-end task execution.
- [x] 5.3 Add verification coverage for one built-in tool task and one external-command task using the same request and run-status flow.
- [x] 5.4 Write operator documentation covering Feishu app setup, local configuration, reload or restart semantics, storage location, and deployment on the macOS host.

## 6. Multi-Bot Single-Process Support

- [x] 6.1 Refactor the TOML schema from a single-bot layout to `[bots.<id>]` and validate each bot's credentials, routes, storage path, allowed users, and task catalog.
- [x] 6.2 Introduce a BotManager that constructs one bot-scoped service instance, Feishu `Client`, and `WSClient` per configured bot while keeping shared `tools/` code reusable.
- [x] 6.3 Refactor the shared HTTP server so `/bots/<id>/webhook/card` and `/bots/<id>/webhook/event` dispatch to the correct bot instance and reject unknown bot IDs.
- [x] 6.4 Isolate runtime state per bot, including pending confirmations, task registries, and one SQLite file per bot.
- [x] 6.5 Make startup and reload atomic across the full bot map so invalid updates preserve the previously active bot set.
- [x] 6.6 Add tests and manual verification for at least two bots running in one process with distinct credentials, task catalogs, and run stores.

## 7. Pairing-Based Authorization

- [x] 7.1 Add a per-bot persistent pairing store that records pending unauthorized-user pairing requests with `actor_id`, six-digit `pair_code`, expiration, and used state.
- [x] 7.2 Return an authorization card for unauthorized Feishu users that includes the exact local admin command `auth-tool pair <bot_id> <pair_code>` without exposing the task catalog.
- [x] 7.3 Implement a local `auth-tool pair <bot_id> <pair_code>` script that resolves pending pairing requests, updates that bot's `allowed_users` in TOML, and rejects invalid or expired codes.
- [x] 7.4 Add an explicit local reload mechanism that the pairing tool can invoke so authorization changes take effect immediately without process restart.
- [x] 7.5 Ensure pairing success is atomic from an operator perspective: the code is marked used only after the TOML update and immediate reload both succeed.
- [x] 7.6 Add tests and operator documentation covering unauthorized-user pairing, invalid or expired codes, immediate post-pair authorization, and multi-bot pairing isolation.

## 8. Text-Driven Task Invocation

- [x] 8.1 Refactor task list cards so they are informational only, remove per-task execution buttons, and include an example `/run <task_id> key=value ...` string for each task.
- [x] 8.2 Add structured `/run <task_id> key=value ...` text command parsing with clear validation errors for unknown tasks, malformed parameters, and missing required values.
- [x] 8.3 Change the pending execution flow so `/run ...` returns a confirmation card with only `confirm` and `cancel` actions, and remove card-side parameter collection.
- [x] 8.4 Implement `cancel` for pending confirmations so users can dismiss a not-yet-started request without creating a run, while keeping running-task cancellation semantics separate.
- [x] 8.5 Refactor run-status cards to informational display only and remove non-essential action buttons that are not part of the confirmation step.
- [x] 8.6 Add tests and operator documentation covering task example commands, `/run ...` parsing, confirmation-card button flow, and pending-confirmation cancellation.

## 9. Feishu Result Contract Clarification

- [x] 9.1 Normalize the informational run card shape so synchronous confirm responses, asynchronous push updates, and `/run-status <run_id>` all render the same required fields.
- [x] 9.2 Add a Feishu-backed `RunUpdateSink` that pushes milestone updates to the originating chat at `running` and terminal state transitions.
- [x] 9.3 Persist or otherwise retain the originating Feishu delivery context needed for asynchronous push updates without breaking per-bot isolation.
- [x] 9.4 Implement summary normalization and truncation rules for Feishu delivery, including primary-error preference and a 300-character cap with ellipsis.
- [x] 9.5 Ensure push-delivery failures do not affect persisted run state and are recoverable through `/run-status <run_id>`.
- [x] 9.6 Add tests and operator documentation covering synchronous confirm responses, asynchronous milestone pushes, summary truncation behavior, and push-failure recovery.

## 10. WebSocket Health And Failover Visibility

- [x] 10.1 Add bot-scoped WebSocket connection state tracking that records connected, reconnecting, disconnected, and recent error conditions per bot.
- [x] 10.2 Extend the shared health or diagnostic endpoint so it reports per-bot WebSocket readiness, last successful connection time, next reconnect attempt time, and consecutive reconnect failures.
- [x] 10.3 Reset and maintain reconnect-failure counters correctly across disconnect and reconnect cycles without leaking state across bots.
- [x] 10.4 Emit an operator-facing warning when a bot exceeds the documented reconnect-failure threshold and include the prepared Webhook fallback endpoint for that bot.
- [x] 10.5 Keep failover operator-driven by explicitly avoiding automatic Feishu subscription-mode changes or dual-active ingestion.
- [x] 10.6 Add tests and operator documentation covering healthy connections, reconnecting bots, degraded-but-process-up health output, sustained-failure warnings, and recovery after reconnect.
- [x] 10.7 Ensure process shutdown closes bot WebSocket clients without spawning replacement connections in the stopping process.
- [x] 10.8 Ensure configuration reload explicitly starts replacement bot WebSocket clients after retiring the old runtimes, and add regression coverage for reload-time event-ingress recovery.

## 11. Structured Inbound Event Logging

- [x] 11.1 Define a bot-scoped structured event-log schema for inbound Feishu interactions, including normalized event type, actor, decision, and optional task/run/confirmation identifiers.
- [x] 11.2 Implement event logging for supported text commands and card actions after routing reaches bot business logic, including authorized, unauthorized, invalid-command, and validation-failure outcomes.
- [x] 11.3 Redact or summarize sensitive inputs in event logs so raw payloads, full parameter maps, pairing codes, and full stdout/stderr bodies are not recorded.
- [x] 11.4 Ensure event logging remains distinct from persisted run lifecycle storage while allowing operators to correlate interaction logs with `run_id` and `confirmation_id`.
- [x] 11.5 Add tests covering authorized commands, unauthorized pairing-triggered requests, malformed `/run ...` commands, and card confirmation or cancellation decisions.
- [x] 11.6 Update operator documentation with the event-log purpose, retained fields, and redaction boundaries.

## 12. Command Help Surface

- [x] 12.1 Add a `/help` text command that returns an informational command-reference card for authorized users.
- [x] 12.2 Ensure the `/help` response documents `/tasks`, `/run <task_id> key=value ...`, `/run-status <run_id>`, `/cancel <run_id>`, and `/reload`.
- [x] 12.3 Keep `/help` task-agnostic and direct users to `/tasks` for bot-specific example commands and parameter expectations.
- [x] 12.4 Add tests covering authorized `/help`, unauthorized `/help`, and the unsupported-command fallback after `/help` becomes a supported command.
- [x] 12.5 Update operator documentation and user-facing examples to include `/help` as the entry command for learning the bot interface.

## 13. Unified `kfc` CLI And Cronjob Tasks

- [x] 13.1 Refactor the task configuration schema from a single `type` field to `runner_kind` plus `execution_mode`, and add cronjob-specific TOML fields for `schedule` and `auto_start`.
- [x] 13.2 Replace the long-term in-process built-in tool execution path with repository-owned executable built-in tool entrypoints that can be launched through the same controlled child-process boundary as external commands.
- [x] 13.3 Introduce the unified local `kfc` CLI with `service start --config ...`, `service restart`, `service stop`, `pair <pair_code>`, and `exec --bot BOT_ID --task TASK_ID`.
- [x] 13.4 Replace `auth-tool` pairing flows with `kfc pair`, including the new globally unique pair-code format `<bot_id>-<6 random alphanumeric characters>`.
- [x] 13.5 Add `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, and `/cron status`, and enforce mode-mismatch validation between `/run` and `/cron`.
- [x] 13.6 Translate configured cron expressions into launchd plist definitions with stable labels `com.kidsalfred.<bot_id>.<task_id>` and execute cronjobs through `kfc exec`.
- [x] 13.7 Add a persisted cronjob state model separate from one-shot run history, including desired state, observed launchd state, timestamps, and latest error summary.
- [x] 13.8 Reconcile launchd-managed cronjobs during startup and reload so `auto_start = false` jobs are stopped, and `auto_start = true` jobs are restarted or started as required.
- [x] 13.9 Manage the main bot service process itself through macOS launchd behind `kfc service ...`, keeping `kfc service stop` separate from long-term cronjob policy.
- [x] 13.10 Add tests and operator documentation covering the new task schema, `kfc` commands, pair-code format, `/cron` flows, cron-to-launchd translation, startup reconciliation, and direct host-local task execution.
- [x] 13.11 Split main-service lifecycle management into `kfc service install --config ...`, `kfc service uninstall`, `kfc service start`, `kfc service restart`, and `kfc service stop`.
- [x] 13.12 Ensure `install` writes or refreshes `~/Library/LaunchAgents/com.kidsalfred.service.plist` and immediately starts the main service, while `uninstall` stops the service if needed and removes that plist.
- [x] 13.13 Make `kfc service start`, `kfc service restart`, and `kfc service stop` return a clear operator-facing error when the main-service plist is not installed.
- [x] 13.14 Update tests and operator documentation to cover install, uninstall, plist location, and the uninstalled-service error path.
