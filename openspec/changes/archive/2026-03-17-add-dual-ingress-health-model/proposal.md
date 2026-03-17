## Why

The current health model conflates WebSocket long-connection state with overall bot availability. That is too narrow once operators intentionally allow webhook fallback. In practice a bot may remain interactive through webhook delivery while `/health` still reports `websocket.state = reconnecting` and `ready = false`, which is confusing and makes sleep/wake diagnostics harder to interpret.

## What Changes

- Add an explicit server-level ingress mode configuration with two supported values:
  - `websocket-only` (default)
  - `websocket-with-webhook-fallback`
- Expand the canonical health snapshot so it models WebSocket state, webhook fallback observations, and effective bot availability separately.
- Redefine top-level `ready` as "all active bots are serviceable under the configured ingress mode" rather than "all bot WebSocket clients are connected".
- Update HTTP `/health`, `kfc health`, and Feishu `/health` to expose the same dual-ingress health facts, with Feishu rendering a summarized operator-facing card.
- Align `service_reconnected` trigger semantics with the new ingress-mode-aware health model so reconnect notifications reflect recovery of effective bot availability under the configured ingress policy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: `/health` now summarizes ingress mode, effective availability, and fallback/degraded state rather than only WebSocket state.
- `local-task-execution-audit`: health observability and reconnect-notification evaluation now distinguish WebSocket transport health from webhook fallback availability and effective bot serviceability.

## Impact

- Affected code: `src/config/schema.ts`, `src/domain.ts`, `src/health.ts`, `src/feishu/sdk.ts`, `src/feishu/cards.ts`, `src/http/server.ts`, `src/kfc.ts`, and related tests/docs.
- APIs: the canonical health JSON contract changes shape to include ingress mode, per-bot webhook observations, and effective availability fields.
- Operations: operators can explicitly choose strict WebSocket-only behavior or allow webhook fallback, and both health output and reconnect notifications will use the same ingress-mode-aware serviceability rules.
