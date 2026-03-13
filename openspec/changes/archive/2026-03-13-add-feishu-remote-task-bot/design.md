## Context

The repository currently contains only OpenSpec scaffolding, so this change defines the first end-to-end product slice. The requested bot is not a general shell proxy: it is a Feishu-operated task runner deployed on a single macOS host and limited to predefined operations tasks. The main constraints are low operational risk, traceability, and an interaction model that works inside Feishu without adding a separate admin UI. The design now also needs to support multiple Feishu bots loaded into one process without merging their credentials, task catalogs, or run history.

Implementation stack is now fixed for v1: TypeScript on Node.js, SQLite for persistence, TOML for local configuration, direct child-process execution for tasks, and the official Feishu SDK `@larksuiteoapi/node-sdk` for platform integration. Feishu event subscriptions will use the SDK's WebSocket long-connection mode as the primary inbound channel.

## Goals / Non-Goals

**Goals:**
- Accept Feishu bot events and provide task-centric interactive responses.
- Allow one process to host multiple independently configured Feishu bots.
- Restrict task execution to a local registry of predefined tasks and allowed Feishu users.
- Allow an unauthorized Feishu user to complete a locally approved pairing flow that adds the user to `allowed_users` without restarting the service.
- Execute tasks on the hosting macOS machine with lifecycle tracking, timeouts, and optional cancellation.
- Persist execution records with stable run identifiers so operators can inspect prior runs.
- Return clear progress and final outcome messages to Feishu users.

**Non-Goals:**
- Multi-host routing, SSH fan-out, or distributed task agents.
- Arbitrary shell command execution from chat input.
- A web console for task or user administration.
- Complex workflow composition across multiple tasks in v1.

## Decisions

### 1. Feishu is the only v1 interaction surface

The bot SHALL use Feishu event callbacks plus interactive cards or messages as the primary user interface. This keeps the operator workflow in chat and avoids duplicating state across a separate UI.

The interaction model SHALL be hybrid:
- `/help` returns a concise command reference for the bot's supported text interface
- `/tasks` returns one-shot tasks and example `/run TASK_ID key=value ...` commands
- `/cron list` returns cronjob tasks and their managed state summaries
- task discovery and status cards are primarily informational
- parameter entry for one-shot tasks happens through structured text commands such as `/run TASK_ID key=value ...`
- cronjob management happens through `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, and `/cron status`
- execution confirmation uses a narrow interactive confirmation card with only `confirm` and `cancel` actions for the pending request

This keeps the card surface within stable interaction patterns while avoiding complex card-side form collection for task parameters. `/help` is the command-surface primer, `/tasks` remains the place to discover bot-specific one-shot task examples and parameter shapes, and `/cron` is the explicit management surface for configured recurring jobs.

Alternative considered:
- Plain text command parsing only: simpler, but weaker for explicit pre-execution confirmation.
- Feishu plus web admin UI: more complete, but much larger scope and another authentication surface.

### 2. Feishu event subscriptions use WebSocket as the primary ingress

The bot SHALL receive Feishu event subscriptions over the official SDK's WebSocket long-connection mode. This is the primary path for inbound bot events such as message reception. Based on the official SDK documentation, long connection mode reduces access cost, avoids public callback exposure during development, and is directly supported by `@larksuiteoapi/node-sdk` from version `1.24.0` onward.

The design SHALL treat the WebSocket client as a managed runtime component with explicit connection lifecycle handling, health reporting, and reconnect behavior. The bot SHALL assume only one active client instance will receive a given event, because the SDK documentation states long-connection delivery is cluster-mode and not broadcast.

Alternative considered:
- Webhook-only event subscription: simpler operationally for stable public deployment, but higher setup cost and less convenient for local development.

### 3. Execution is configuration-driven, local-only, and mode-aware

Tasks SHALL be defined in a local configuration file with:
- task identifier and description
- runner kind
- execution mode
- executable command or script path for external-command tasks
- tool identifier for built-in tool tasks
- parameter definitions and validation rules
- timeout
- whether cancellation is allowed
- cron schedule and auto-start policy for cronjob tasks

The runtime SHALL refuse any task or parameter set that is not declared in configuration. This is the core control that prevents the bot from becoming a general-purpose shell.

Alternative considered:
- Free-form shell execution: rejected because it materially expands the threat surface.
- Remote SSH routing: rejected for v1 because it adds host inventory, credential handling, and routing semantics.

### 4. The process hosts multiple isolated bots through a BotManager

The runtime SHALL load bot definitions from a TOML structure keyed as `[bots.<id>]`. Each bot identifier SHALL be stable and used as the canonical routing and logging key. A top-level BotManager SHALL own the active bot set and construct, for each bot:
- one bot-scoped service instance
- one Feishu API client
- one Feishu WebSocket client
- one task registry
- one run store

The process SHALL use one shared HTTP server, but inbound HTTP paths SHALL be bot-scoped, for example `/bots/<id>/webhook/card` and `/bots/<id>/webhook/event`. This allows one process to multiplex multiple Feishu apps without conflating callback traffic.

Alternative considered:
- Separate process per bot: operationally simple, but duplicates process overhead and makes shared deployment and reload behavior harder to manage.
- Array-style `[[bots]]` configuration: workable, but weaker as a stable identifier model for routing, logging, and reload diffs.

### 5. Each bot uses isolated credentials and storage

Each bot SHALL keep its own Feishu credentials, allowed-user list, task definitions, and SQLite database path. Built-in tool implementations may be shared from the common `tools/` directory, but task exposure SHALL remain bot-specific through configuration.

Per-bot SQLite is preferred to a shared database because it keeps fault isolation, backup, inspection, and schema evolution simpler in the first multi-bot version.

Alternative considered:
- Shared SQLite with `bot_id` columns: reduces file count, but increases coupling and makes incident isolation weaker.

### 6. Predefined tasks separate runner kind from execution mode

The task registry SHALL support exactly two runner kinds in v1:
- built-in tools that are shipped with the service repository
- external commands executed as declared child processes

The task registry SHALL also support exactly two execution modes in v1:
- `oneshot` for Feishu-confirmed ad hoc runs
- `cronjob` for launchd-managed recurring jobs

Built-in tools SHALL evolve from in-process runtime hooks to repository-owned executable scripts that can be launched through the same controlled child-process boundary as external commands. This gives the service one consistent execution contract for Feishu-triggered runs, local admin execution, and launchd-managed cronjobs. The long-term built-in tool contract is therefore "bundled and controlled by the service" rather than "must execute inside the Node.js process".

External-command tasks SHALL remain configuration-defined and execute only the explicitly declared binary or script path with validated parameters.

Cronjob tasks MAY use either runner kind, but their runtime parameters SHALL be fixed in configuration. `/cron start` and `/cron stop` manage lifecycle only; they do not accept dynamic user-supplied task parameters in v1.

Alternative considered:
- Only external commands: simpler, but forces logic-heavy tasks into scripts and makes in-process integrations awkward.
- Only built-in tools: safer for some cases, but too restrictive for operations tasks that already exist as host-local commands or scripts.

### 7. Task configuration changes require explicit activation

Task registry changes SHALL not take effect implicitly from file writes. New, updated, or removed task definitions SHALL become active only after either:
- an explicit reload action initiated by an authorized operator or local admin flow, or
- a controlled service restart

This prevents partial reads, makes task visibility changes auditable, and gives operators a clear mental model for when a task catalog has changed.

In the multi-bot model, reload SHALL validate the full TOML document first and then atomically replace the active bot map only if every bot definition is valid. Partial bot activation is not allowed in v1.

Alternative considered:
- Automatic file watching with immediate reload: more convenient, but higher risk of inconsistent state and accidental activation of half-written changes.

### 7a. Unauthorized users pair through `kfc pair` and immediate reload

The authorization model SHALL remain configuration-driven through each bot's `allowed_users`, but the system SHALL provide a controlled local pairing path for onboarding one user at a time. When a Feishu user who is not currently authorized sends a supported message or card action, the bot SHALL:
- identify the bot-scoped actor ID (`open_id` or equivalent active actor identifier)
- generate a globally unique one-time `pair_code` in the form `<bot_id>-<6 random alphanumeric characters>`
- persist a pending pairing record in that bot's SQLite store with at least `bot_id`, `actor_id`, `pair_code`, creation time, expiration time, and used state
- return a Feishu card that does not expose task details but does show the exact local admin command to run:
  - `kfc pair <pair_code>`

The local `kfc pair` flow SHALL run only on the bot host. It SHALL:
- parse the `bot_id` from the supplied `<pair_code>` and resolve the pending pairing record for that bot and code
- reject expired, unknown, malformed, cross-bot, or already-used codes
- append the resolved `actor_id` to that bot's `allowed_users` in TOML if it is not already present
- trigger an explicit local reload path in the running service immediately after the TOML update succeeds
- mark the pairing code as used only after the reload succeeds

The service SHALL apply the resulting authorization change without requiring process restart. This preserves TOML as the authorization source of truth while still making the operator experience immediate.

Alternative considered:
- Manual edit plus restart: simpler, but too slow and error-prone for routine onboarding.
- SQLite-only dynamic authorization: more direct for pairing, but splits the authorization truth across configuration and runtime storage.
- Process signal only (for example `SIGHUP`) as the reload trigger: workable, but weaker for observability and error feedback than an explicit local admin reload channel.

### 8. TypeScript on Node.js is the implementation language

The service SHALL be implemented in TypeScript running on Node.js. This matches the selected Feishu SDK, provides mature child-process and HTTP primitives, and keeps the service deployable as a single runtime on macOS.

Alternative considered:
- Python: viable, but rejected because the chosen official Feishu SDK and the requested stack center on Node.js.

### 9. An external HTTP framework is not required for v1

The bot does not need an HTTP framework for its primary event ingress, because event subscriptions will arrive over WebSocket. It still needs only a narrow HTTP surface: message-card callback handling and a small set of health or diagnostic endpoints if desired. Node.js built-in HTTP support is sufficient for this scope, so v1 SHALL not depend on Express, Fastify, or a similar framework unless implementation reveals a concrete need such as complex middleware composition or multiple public endpoints.

This keeps the service smaller and reduces framework overhead in a first version whose core complexity lies in task orchestration rather than request routing.

Alternative considered:
- Fastify or Express: both would improve ergonomics for larger HTTP surfaces, but are not justified by the current endpoint count.

### 10. WebSocket interruption has a controlled fallback, not automatic dual-active failover

The design SHALL not assume a transparent backup path when the Feishu WebSocket connection drops. The official SDK documentation describes WebSocket long-connection mode for event subscriptions, but also notes that it supports event subscriptions only and does not support callback subscriptions. In practice, v1 therefore uses two inbound mechanisms with distinct roles:
- WebSocket as the normal path for event subscriptions
- HTTP callback endpoint for interactive card actions

For event-subscription outages, the backup strategy SHALL be operational failover to Webhook mode rather than simultaneous dual-active ingestion. The implementation SHOULD keep a minimal HTTP event endpoint available behind the same Node.js process so the Feishu app configuration can be switched to Webhook delivery during sustained WebSocket incidents. This avoids undocumented assumptions about automatic replay or concurrent delivery across both modes.

The runtime SHALL also expose bot-scoped WebSocket connection health rather than treating the SDK connection as opaque. For each active bot, the process SHALL track and surface at least:
- current WebSocket connectivity state such as `connecting`, `connected`, `reconnecting`, or `disconnected`
- the last successful connection timestamp
- the next scheduled reconnect attempt timestamp when reconnect is pending
- the most recent connection error or disconnect reason when known
- a rolling count of consecutive reconnect failures since the last successful connection

The shared health or diagnostic surface SHALL include this WebSocket status for every active bot so operators can distinguish between "process is up" and "bot is actually receiving events". A green process health response alone is not sufficient when the underlying event stream is disconnected.

The failover policy SHALL remain operator-driven, but the system SHOULD make sustained WebSocket failure visible enough to act on. When a bot exceeds a configurable or documented reconnect-failure threshold, the runtime SHOULD emit a clear operator-facing warning that the app can be switched to the prepared Webhook event endpoint. This warning is guidance only; the implementation SHALL not automatically activate dual delivery or mutate the Feishu app subscription mode on its own.

The lifecycle semantics for intentional close operations SHALL distinguish between service shutdown and runtime replacement:
- when the overall process is stopping, an intentional WebSocket close is terminal for that process and SHALL NOT trigger a replacement connection attempt
- when a bot runtime is being replaced during reload, intentionally closing the old runtime's WebSocket is part of a handoff and SHALL be followed by explicit startup of the replacement runtime's WebSocket client
- reload correctness therefore requires that newly activated bot runtimes establish fresh long connections after the old runtimes have been retired, rather than relying on the closed client's internal reconnect behavior

This distinction prevents shutdown loops during process exit while still guaranteeing that a successful reload restores event ingress for the newly active bot set.

Alternative considered:
- No backup path: simpler, but leaves the bot unavailable during prolonged WebSocket outages.
- Always-on dual-active WebSocket plus Webhook ingestion: rejected because the official docs do not establish this as a safe or deduplicated operating mode.

### 11. One-shot runs and cronjob jobs use distinct persisted state models

Each run SHALL have a stable `run_id` and transition through a small state machine such as `pending_confirmation`, `queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`, and `rejected`. Persisting these transitions allows run lookup, duplicate-click protection, and restart-safe status inspection.

Before a run is created, the system SHALL also support a lightweight pending confirmation step produced by a parsed `/run ...` text command. The pending confirmation SHALL carry the selected task, validated parameter set, requesting actor, and a confirmation token that can be consumed by a confirmation card button or cleared by a cancel button. Cancelling a pending confirmation SHALL not create a run and SHALL not be treated as cancelling an already running task.

Cronjob-managed tasks SHALL use a separate persisted state model keyed by `bot_id` and `task_id` rather than by `run_id`. That cronjob model SHALL capture at least the configured launchd label, desired lifecycle state, observed launchd state, auto-start policy, and the latest management timestamps or error summary. `/cron status` SHALL query this cronjob state model rather than the one-shot run-history model.

Alternative considered:
- Keep state only in memory: simpler, but loses traceability and restart recovery.
- Persist only final results: insufficient for progress tracking and reconciliation after interruption.

### 12. SQLite is the local persistence layer

Audit data SHALL be stored in SQLite on the bot host. In the multi-bot model, each bot SHALL use its own SQLite file. The schema for each bot store SHALL support:
- run lookup by `run_id`
- recent run listing
- pending pairing lookup by `pair_code`
- cronjob state lookup by `task_id`
- atomic status updates
- durable storage across process restart

SQLite keeps deployment simple, fits the single-host constraint, and gives stronger queryability and update semantics than flat files while avoiding an external database.

Alternative considered:
- External database service: unnecessary operational overhead for the first version.
- Flat files only: weaker for indexed run lookup and transactional state transitions.

### 13. TOML is the local configuration format

The bot SHALL load its local configuration from TOML. The configuration SHALL define a top-level `bots` map, and each `[bots.<id>]` section SHALL define allowed users, Feishu credentials, server route metadata, storage path, task metadata, runner kind, execution mode, execution target metadata, parameter schemas, timeout values, cancellation policy, and cron configuration in a human-editable format suitable for host-local administration.

TOML is chosen because it is concise, readable, and better suited than environment variables for nested task definitions.

Alternative considered:
- JSON: machine-friendly, but less convenient for hand-edited operational configuration.
- YAML: more flexible, but also more complex and easier to misread in operational edits.

### 14. Task execution uses direct child processes

The executor SHALL launch external-command tasks directly as child processes from the Node.js service. Standard output and standard error SHALL be captured incrementally for local log storage and summarized for Feishu status updates. Built-in tool tasks SHALL also execute through controlled child-process entrypoints so they share the same execution boundary, audit semantics, and launchd compatibility as external commands.

This approach is sufficient for a single-host v1 and avoids introducing a queue worker, separate supervisor, or job runner before those concerns are justified.

Alternative considered:
- External job queue or worker process: better for scale-out, but unnecessary for the current single-host scope.
- Shell-wrapper execution for arbitrary commands: rejected because it weakens control over the executable boundary.

### 14a. `kfc` is the unified local CLI entrypoint

The host-local administrative and execution surface SHALL be unified behind a single CLI named `kfc`. The supported v1 commands SHALL be:
- `kfc service install --config /path/to/bot.toml`
- `kfc service uninstall`
- `kfc service start`
- `kfc service restart`
- `kfc service stop`
- `kfc pair <pair_code>`
- `kfc exec --bot <bot_id> --task <task_id>`

The service-installation and lifecycle semantics SHALL be:
- `kfc service install --config /path/to/bot.toml` writes or refreshes the main-service launchd plist, installs launchd management, and immediately starts the service
- `kfc service uninstall` stops the managed service if it is running, removes the main-service launchd plist, and cancels launchd management
- `kfc service start` starts an already-installed main service without rewriting the plist
- `kfc service restart` restarts an already-installed main service without rewriting cronjob policy
- `kfc service stop` stops an already-installed main service without uninstalling it and without rewriting cronjob policy

The main-service launchd plist SHALL use the stable label:
- `com.kidsalfred.service`

The main-service launchd plist SHALL be stored at:
- `~/Library/LaunchAgents/com.kidsalfred.service.plist`

Lifecycle error behavior SHALL be explicit:
- `install` and `uninstall` should be operator-friendly and idempotent where practical
- `start` and `restart` SHALL return a clear error if the main service has not been installed
- `stop` SHALL return a clear error if the main service has not been installed, rather than silently succeeding

`kfc exec` SHALL be the controlled local execution entrypoint for configured tasks. It serves two roles:
- a direct host-local operator path for running a configured task without Feishu confirmation
- the execution command referenced by launchd-managed cronjob plists

Because `kfc exec` is a host-local administrative interface, it is intentionally outside the Feishu confirmation flow. It SHALL still refuse any task that is not declared in configuration.

### 14b. Cronjob tasks are managed through launchd and `/cron`

Cronjob tasks SHALL be translated from TOML schedule configuration into launchd plist definitions managed on macOS. The schedule source of truth in configuration SHALL be a cron expression; the system is responsible for translating that expression into the supported launchd plist schedule representation for v1.

Each cronjob SHALL use a stable, bot-scoped launchd label in the form:
- `com.kidsalfred.<bot_id>.<task_id>`

Launchd-managed cronjobs SHALL execute through:
- `kfc exec --bot <bot_id> --task <task_id>`

Service startup and configuration reload SHALL reconcile cronjob state against configuration:
- when `auto_start = false`, the service SHALL stop the job if `launchctl` reports it as running
- when `auto_start = true` and the job is already running, the service SHALL stop it and then start it again
- when `auto_start = true` and the job is not running, the service SHALL start it

The main bot service process itself SHALL also be managed by macOS launchd so the host can provide boot-time startup and crash recovery. `kfc service install` installs or refreshes `~/Library/LaunchAgents/com.kidsalfred.service.plist` and starts the service. `kfc service uninstall` bootstraps a clean removal by stopping the service first if necessary and then deleting that plist. `kfc service stop` stops the service process but does not rewrite cronjob policy. On the next service start, cronjob reconciliation SHALL reapply the configured desired state.

### 15. The official Feishu SDK is the integration layer

The bot SHALL use `@larksuiteoapi/node-sdk` for Feishu authentication, event handling support, and API calls. Using the official SDK reduces protocol drift risk and aligns the implementation with the selected Node.js stack.

Alternative considered:
- Direct REST integration without SDK: possible, but requires more manual signing, request shaping, and maintenance.

### 16. Feishu responses are status-oriented, not log-stream heavy

The bot SHALL send status checkpoints and concise result summaries back to Feishu. Full logs may be stored locally and exposed as summarized excerpts in chat. Task list cards and run status cards SHALL be read-only informational views. The only card actions retained in v1 are the `confirm` and `cancel` actions on a pending confirmation card returned from a `/run ...` command. This reduces noisy chat updates and avoids pushing large log bodies or fragile card-form state into IM messages.

The Feishu result contract SHALL distinguish between synchronous acknowledgment, asynchronous push updates, and on-demand pull:
- the synchronous response to a successful `confirm` action SHALL be an informational run card for the newly created `run_id`, typically showing the initial `queued` state
- the runtime SHALL push follow-up informational run cards to the originating Feishu chat when the run transitions to `running` and when it reaches a terminal state (`succeeded`, `failed`, `timed_out`, or `cancelled`)
- `/run-status <run_id>` SHALL return the same canonical informational run card shape using the latest persisted state
- the system SHALL not push one message per log line, stdout chunk, or stderr chunk

The canonical run card returned to Feishu SHALL include these fields:
- `Run ID`
- `Task`
- `State`
- `Actor`
- `Started At` when known
- `Finished At` when the run is terminal
- `Summary`

The `Summary` field SHALL be a normalized operator-facing excerpt rather than raw command output. The normalization rules for v1 are:
- prefer the task result `summary` field when present
- for failed runs, prefer the primary error message over full stderr
- truncate the final summary rendered to Feishu to a single concise excerpt of at most 300 characters
- append an ellipsis when truncation occurs
- never stream or inline the full stdout or stderr body into the chat response

If an asynchronous push update to Feishu fails, the system SHALL still persist the authoritative run state locally and keep `/run-status <run_id>` as the recovery path for operators.

Alternative considered:
- Full live log streaming to Feishu: high message volume and poor operator ergonomics.

### 17. Inbound Feishu events use structured decision logging

The runtime SHALL record a structured operator log entry for each supported inbound Feishu interaction that reaches bot business logic. This logging is intended for traceability and incident review, not raw payload capture. The design SHALL therefore log normalized decision records rather than storing full Feishu event bodies.

Each inbound event log record SHALL include at least:
- timestamp
- `bot_id`
- `channel` set to `feishu`
- normalized `event_type` such as `im.message.receive_v1` or `card.action.trigger`
- `actor_id`
- `chat_id` when available, or an explicit empty value when not available
- a normalized command or action type such as `tasks`, `run`, `run_status`, `cancel_run`, `reload`, `confirm_task`, `cancel_confirmation`, or `unknown`
- the resulting decision such as `authorized`, `authorization_required`, `invalid_command`, `validation_failed`, `confirmation_created`, `confirmation_cancelled`, `run_started`, `run_cancel_requested`, `status_returned`, or `reload_requested`
- `task_id`, `run_id`, and `confirmation_id` when applicable
- a concise `error_summary` when the interaction fails

The logging boundary SHALL intentionally exclude sensitive or high-volume fields. v1 SHALL NOT persist or emit by default:
- the full raw Feishu payload
- full message text bodies beyond a short normalized command summary
- full card-action payloads
- complete task parameter maps
- one-time pairing codes in plaintext
- stdout or stderr bodies

Parameter-bearing commands SHOULD be logged using a redacted or summarized parameter description rather than the original user-supplied values. When the actor is unauthorized, the log entry SHALL still be recorded with the `authorization_required` decision so operators can correlate pairing requests and rejected access attempts.

These inbound event decision logs complement, but do not replace, persisted run audit records. Run history remains the source of truth for execution lifecycle and result state, while structured event logs provide a higher-level trail of who attempted which interaction and how the bot responded.

Alternative considered:
- Persisting the full raw Feishu payload for every event: simpler to implement initially, but too noisy and risks leaking sensitive task parameters and authorization material.

## Risks / Trade-offs

- [Risk] Feishu callback retries may create duplicate actions. -> Mitigation: persist idempotency keys for confirmation actions and reject duplicate run creation for the same confirmation token.
- [Risk] A predefined task can still be dangerous if its script is overly broad. -> Mitigation: require explicit task registration, narrow parameters, and clear ownership of local scripts.
- [Risk] Multiple bots in one process can accidentally share state. -> Mitigation: make bot ID a first-class routing key and keep each bot's service, credentials, registry, and SQLite isolated.
- [Risk] Built-in tool tasks can drift from the external-command execution model. -> Mitigation: converge both runner kinds on executable entrypoints and one shared child-process execution contract.
- [Risk] Long-running commands may outlive the bot process. -> Mitigation: track child process identifiers, reconcile persisted run state on startup, and mark unrecoverable executions clearly.
- [Risk] Local-only persistence can become a single point of failure. -> Mitigation: keep the storage path explicit and back-up friendly, and document retention and recovery expectations.
- [Risk] macOS process behavior differs from Linux-centric operations tooling. -> Mitigation: design executor behavior around generic POSIX process control and document host-specific assumptions.
- [Risk] Avoiding a web framework reduces abstraction around request parsing and middleware. -> Mitigation: keep the HTTP surface intentionally narrow and introduce a framework only if endpoint complexity materially increases.
- [Risk] WebSocket disconnects can stop new event intake until reconnection or failover. -> Mitigation: implement connection health checks, automatic reconnect, and a documented switch to Webhook event delivery for sustained outages.
- [Risk] WebSocket long-connection delivery is not broadcast across multiple clients. -> Mitigation: run a single active event-consumer instance per app or add explicit leader-election before scaling out.
- [Risk] Configuration reload can activate invalid task definitions. -> Mitigation: validate the full TOML document before swapping the active registry and keep the previous registry on reload failure.
- [Risk] One bot's bad configuration can block all bots during atomic reload. -> Mitigation: fail the reload explicitly, preserve the prior active bot map, and surface which bot failed validation.
- [Risk] Pairing codes could be replayed or guessed. -> Mitigation: make codes short-lived, one-time-use, bot-scoped, and auditable in persistent storage.
- [Risk] The local pairing tool could update TOML but fail to activate the change. -> Mitigation: trigger immediate reload as part of the tool flow and only mark the code used after reload succeeds.
- [Risk] Event logs can leak sensitive message content or task parameters. -> Mitigation: log normalized command summaries and decision metadata only, and explicitly exclude raw payloads, full parameters, pairing codes, and full process output.
- [Risk] Cron-expression support does not map perfectly onto launchd scheduling primitives. -> Mitigation: document the supported cron subset for v1 and reject schedules that cannot be translated safely.
- [Risk] A service restart can inherit stale launchd cronjob state. -> Mitigation: reconcile every configured cronjob at startup and reload based on `auto_start` and observed `launchctl` state.

## Migration Plan

1. Register the Feishu app and configure event callback credentials.
2. Deploy the process onto the target macOS host with the multi-bot TOML configuration, per-bot storage paths, and runtime secrets.
3. Seed each bot's allowed user list and initial predefined operations tasks.
4. Validate both runner kinds with at least one built-in tool task and one external-command task in a non-production environment.
5. Validate bot-scoped WebSocket event connectivity, HTTP card-callback handling, and a smoke-test task in a non-production Feishu chat for at least two bots.
6. Prepare the fallback Webhook event endpoints and document the Feishu-side switch procedure for WebSocket incidents.
7. Verify atomic reload and controlled-restart activation flows before production rollout.
8. Verify the unauthorized-user pairing flow, including the emitted `kfc pair <pair_code>` command and immediate post-pair authorization.
9. Verify cronjob reconciliation, launchd plist generation, and `/cron` management flows in a non-production macOS environment before enabling auto-starting jobs.
10. Promote to production usage after verifying audit records, timeout behavior, failure notifications, pairing audit records, and cronjob state recovery.

Rollback:
- Disable the Feishu app callback or bot availability.
- Preserve the local run history store for audit review.
- Remove or disable task definitions if selective rollback is required.
- If needed, switch event reception from WebSocket back to Webhook mode until the long connection is restored.

## Open Questions

- Whether cancellation should send a termination signal only or also support task-specific cleanup hooks.
- Whether recent run lookup should be limited to the requesting user or visible to all authorized operators.
- Whether successful local pairing should proactively notify the newly authorized Feishu user or rely on the user retrying the original command.
