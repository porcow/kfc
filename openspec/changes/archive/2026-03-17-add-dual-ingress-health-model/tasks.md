## 1. Configuration and domain model

- [x] 1.1 Add `server.ingress_mode` config parsing and validation with supported values `websocket-only` and `websocket-with-webhook-fallback`, defaulting to `websocket-only`
- [x] 1.2 Extend domain health types to model top-level ingress mode/degraded state and per-bot WebSocket, webhook, and effective availability details

## 2. Webhook observation tracking

- [x] 2.1 Record per-bot webhook ingress observations from the bot-scoped event HTTP path, including the latest webhook event timestamp and event type
- [x] 2.2 Define and apply a bounded webhook recency window so fallback availability uses recent observations instead of stale history

## 3. Canonical health snapshot

- [x] 3.1 Update the shared health snapshot builder to compute `ready`, `degraded`, and per-bot `availability` according to the configured ingress mode
- [x] 3.2 Preserve existing WebSocket diagnostics while exposing webhook observation fields for debugging and operator interpretation

## 4. Health surfaces

- [x] 4.1 Update HTTP `/health` and `kfc health` to expose the expanded canonical health JSON contract
- [x] 4.2 Update Feishu `/health` rendering so operators can see ingress mode, bot availability, active ingress, degraded state, WebSocket state, and webhook fallback observations

## 5. Transport event semantics and verification

- [x] 5.1 Keep `service_online` session-scoped, but update `service_reconnected` to use the same ingress-mode-aware availability predicate used by health
- [x] 5.2 Adjust reconnect notification wording and payload so operators can tell whether recovery happened on WebSocket or webhook fallback
- [x] 5.3 Add focused tests for both ingress modes, fallback-active readiness, strict WebSocket-only readiness, and aligned HTTP/CLI/Feishu health plus reconnect-notification behavior
- [x] 5.4 Update README and manual verification guidance to document ingress modes, dual-ingress health semantics, and degraded-but-available fallback states
