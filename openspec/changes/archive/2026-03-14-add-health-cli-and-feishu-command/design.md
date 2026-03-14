## Context

The service already exposes a useful `/health` JSON payload from the shared HTTP server. That payload is the only live view that combines process liveness, active bot IDs, per-bot WebSocket readiness, and overall `ready` status from the currently running runtime set. Today, operators must fetch it over HTTP manually; neither the local `kfc` CLI nor Feishu text commands surface the same information.

## Goals / Non-Goals

**Goals:**
- Expose the existing health snapshot through `kfc health` for local host operators.
- Expose the same health snapshot through an authorized Feishu `/health` command.
- Keep one canonical health payload contract so HTTP, CLI, and Feishu stay aligned.

**Non-Goals:**
- Adding a separate monitoring store or background collector.
- Replacing `/health` JSON with a new HTTP format.
- Turning `/health` into a privileged admin mutation or remote control action.

## Decisions

### Keep the running service HTTP `/health` payload as the source of truth
`kfc health` will not instantiate a fresh `BotManager`, because a new process would not reflect the live WebSocket state of the already running service. Instead, the canonical health snapshot remains owned by the running service, and the CLI reads it over loopback HTTP using the configured port and `health_path`.

Alternative considered:
- Rebuild health state inside `kfc health` from config. Rejected because it would report a new process's disconnected state rather than the installed service's real ingress state.

### Share one health snapshot builder between HTTP and Feishu
The current HTTP `/health` response shape should be extracted into a reusable health-snapshot builder. The HTTP handler will return it as JSON, and the Feishu `/health` command will use the same structure to render an informational card. This keeps bot lists, readiness, and per-bot WebSocket fields consistent across surfaces.

Alternative considered:
- Reimplement a Feishu-only health summary inside the command handler. Rejected because it would drift from the HTTP contract over time.

### Treat `kfc health` as a read-only operator command with clear failure modes
`kfc health` should resolve the installed or default config path, read the configured port and `health_path`, then query `http://127.0.0.1:<port><health_path>`. If the service is not running or the endpoint is unreachable, the command should fail with a clear operator-facing error rather than printing synthetic or stale health data.

Alternative considered:
- Fall back to cached or partially inferred local data. Rejected because health diagnostics should describe the running service, not guessed state.

### Keep Feishu `/health` authorization aligned with other bot commands
The new `/health` text command should follow the same authorized-user flow as `/help`, `/tasks`, and `/cron ...`. Unauthorized users should receive the existing pairing/authorization response and must not see bot readiness details.

Alternative considered:
- Expose `/health` to all users. Rejected because it leaks internal topology and ingress health to unauthorized users.

## Risks / Trade-offs

- [CLI depends on the service being reachable over loopback] → Return a clear error that the managed service health endpoint could not be reached.
- [Feishu health card could become too dense for many bots] → Render the canonical snapshot selectively, focusing on readiness plus the most actionable per-bot fields.
- [Three entry points could drift over time] → Reuse one shared health snapshot builder and keep the Feishu card derived from that structure rather than separate health logic.
