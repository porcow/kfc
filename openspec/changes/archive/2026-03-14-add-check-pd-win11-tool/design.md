## Context

The repository already supports built-in tools, launchd-managed cronjob tasks, durable SQLite state, and proactive Feishu message delivery for bot-scoped operations. The requested `checkPDWin11.ts` tool is different from ordinary one-shot tasks because it is a polling monitor: each invocation inspects the host process list, compares the current observation with previously persisted state, and only notifies on state transitions.

The host is macOS and the target workload is a Parallels Desktop VM whose display name includes `Windows 11`. Because the tool runs on a polling schedule rather than being integrated with Parallels APIs, "shutdown time" is the time the tool detected the VM had disappeared from the process list, not an exact hypervisor-emitted stop timestamp.

## Goals / Non-Goals

**Goals:**
- Add a built-in tool `checkPDWin11.ts` that can be executed through the existing controlled built-in tool path.
- Detect whether a Parallels Desktop Windows 11 VM instance is currently running by inspecting the macOS process list.
- Persist a bot-scoped, task-scoped `PDWin11State` and the last detected start time so repeated polling runs can detect transitions safely.
- Send proactive Feishu notifications on `off -> on` and `on -> off` transitions.
- Include detected start or shutdown time and computed runtime duration in the transition notifications.
- Make the tool suitable for cronjob execution through the existing `/cron` and `launchd -> kfc exec` model.

**Non-Goals:**
- Exact integration with Parallels APIs, Apple virtualization APIs, or hypervisor event streams.
- Managing the Windows 11 VM lifecycle; this tool only observes and notifies.
- Supporting arbitrary VM detection patterns in v1 beyond the configured Windows 11 match target.
- Streaming continuous uptime updates while the VM remains on.

## Decisions

### 1. The tool is a polling monitor intended to run as a cronjob task

`checkPDWin11.ts` SHALL be designed as a built-in tool that is typically configured with `execution_mode = cronjob`. Each invocation performs one observation cycle and exits. This fits the existing `launchd` and `kfc exec` model and avoids introducing a long-lived monitor daemon inside the main bot process.

Alternative considered:
- Long-lived in-process watcher: rejected because it introduces another runtime lifecycle and weakens the current cronjob-based host management model.

### 2. Process detection uses macOS process-list inspection with fixed matching rules

The tool SHALL inspect the host process list using macOS-compatible process metadata, including process start time and command line. The initial detection rule SHALL look for process entries whose command metadata identifies a Parallels Desktop VM instance and whose command line or display name contains the configured VM target string, defaulting to `Windows 11`.

If multiple matching processes are found, the tool SHALL treat the VM as running and SHALL use the oldest matching process start time as the VM start time for that observation. This is the safest approximation when helper subprocesses exist.

If a matching process exists but the tool cannot parse a start time from the selected process entry, the tool SHALL fail that invocation without changing persisted monitor state. This avoids emitting incorrect lifecycle notifications.

Alternative considered:
- Exact Parallels API integration: likely more precise, but out of scope for this change and not required for the host-local polling design.
- PID-only detection: insufficient because notifications need a start timestamp.

### 3. Monitor state is persisted separately from one-shot run state

The tool SHALL use a durable bot-scoped, task-scoped monitor-state record in SQLite rather than relying on ephemeral process memory. The state record SHALL contain at least:
- current monitor state: `off` or `on`
- last detected Windows 11 start time when state is `on`
- last transition time
- optional last notification metadata for observability

This record is separate from ordinary `run_id` audit rows because repeated cronjob invocations are not semantically one continuous run. The persisted state allows the tool to detect `off -> on` and `on -> off` transitions across process restarts and across cronjob invocations.

Alternative considered:
- Store monitor state only in the tool process: rejected because cronjob invocations are separate processes and would lose continuity.
- Encode monitor state into generic run summaries only: rejected because transition detection needs a stable latest-state record, not historical inference.

### 4. Notifications require an explicit configured Feishu destination

Because cronjob invocations have no originating chat, the tool SHALL not reuse the one-shot `originChatId` mechanism. Instead, the task configuration SHALL provide a fixed notification destination, such as a Feishu `chat_id`, dedicated to proactive monitor notifications.

The built-in tool SHALL NOT own a Feishu SDK client directly. Instead, the tool SHALL return a structured notification intent as part of its transition result, and the outer execution layer invoked through `kfc exec --bot <bot_id> --task <task_id>` SHALL perform Feishu delivery using the resolved bot-scoped Feishu client and the task's configured notification destination. This keeps the tool focused on host observation and transition logic while reusing the existing bot isolation model for outbound delivery.

The tool SHALL send a proactive informational message to that destination only on state transitions:
- `off -> on`: send a startup notification
- `on -> off`: send a shutdown notification
- `on -> on`: no notification
- `off -> off`: no notification

Alternative considered:
- Send to the last operator chat that touched the bot: rejected because cronjob monitoring is autonomous and should not depend on unrelated prior interactions.
- Bot-global default notification chat only: workable, but too coarse when multiple monitor tasks may need different destinations.
- Let the built-in tool instantiate or own a Feishu SDK client directly: rejected because the correct bot context already exists at the outer runner layer and direct SDK ownership inside the tool would duplicate bot-delivery concerns.

### 5. Notification content is transition-oriented and duration-based

The startup notification SHALL include:
- detected Windows 11 start time
- runtime duration from detected start time until the current observation time

The shutdown notification SHALL include:
- detected shutdown time, defined as the observation time when the VM is first found absent after previously being on
- cumulative runtime duration, computed from the persisted start time to the detected shutdown time

The tool SHALL format durations into a concise human-readable string. The shutdown message SHALL not claim sub-poll precision beyond the observation time.

Alternative considered:
- Emit full process metadata in the message: rejected because the operator only asked for lifecycle timing information and uptime.

### 6. The tool configuration stays fixed and task-local

The `checkPDWin11` built-in tool SHALL use task-local fixed configuration values rather than user-supplied runtime parameters. The task definition SHALL provide at least:
- the built-in tool identifier
- the Feishu notification destination
- the VM display-name match string, defaulting to `Windows 11` if omitted

This keeps the cronjob path deterministic and aligned with the existing rule that cronjob tasks do not accept dynamic parameters through `/cron start`.

Alternative considered:
- Dynamic `/cron start TASK_ID vm_name=...` overrides: rejected because cronjob lifecycle commands are not parameterized in v1.

## Risks / Trade-offs

- [Parallels process naming differs across versions] -> Use a configurable VM display-name match string and fail safely when detection is ambiguous.
- [Polling detects shutdown late by up to one schedule interval] -> Define shutdown time explicitly as the detection time and document that precision bound.
- [Notification destination is misconfigured] -> Validate that the task configuration declares a notification target before activation and surface delivery failures in existing Feishu delivery logs.
- [Multiple helper processes match the same VM] -> Choose the oldest matching process start time and keep matching rules narrow to Parallels + VM name.
- [Persisted state drifts from actual host state after manual DB edits] -> Treat the next successful observation as authoritative and transition from the persisted state only through observed process-list results.

## Migration Plan

1. Add the new built-in tool entrypoint and its task-local configuration schema.
2. Add a dedicated persisted monitor-state store or table in the per-bot SQLite database.
3. Add Feishu proactive notification delivery for this tool using the configured destination.
4. Declare a cronjob task in bot TOML for `checkPDWin11` with a suitable polling schedule.
5. Start the cronjob through `/cron start TASK_ID` or service startup reconciliation if `auto_start = true`.

Rollback:
- Remove or disable the cronjob task definition and reload configuration.
- Keep the persisted monitor-state rows harmlessly unused, or remove them in a follow-up migration if needed.

## Open Questions

- None for this proposal. The requested behavior, state model, notification policy, and cronjob usage are sufficiently defined for implementation.
