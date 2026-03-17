## Context

The service currently exposes one canonical health snapshot that feeds HTTP `/health`, `kfc health`, and the Feishu `/health` command. That snapshot is built entirely from per-bot WebSocket health and treats `ready` as "every bot is connected over WebSocket". The repository also documents a webhook fallback drill where bot commands can continue to work after switching Feishu delivery to webhook mode, which means service availability can diverge from WebSocket status.

## Goals / Non-Goals

**Goals:**
- Introduce an explicit ingress mode setting so operators can choose strict WebSocket-only ingress or allow webhook fallback.
- Make the health model distinguish transport health from effective availability.
- Keep one canonical health snapshot contract across HTTP, CLI, and Feishu surfaces.
- Keep `service_online` session-scoped while making `service_reconnected` use the same ingress-mode-aware recovery standard exposed by health.

**Non-Goals:**
- Implementing automatic transport switching inside the service.
- Converting the bot to webhook-only delivery mode.
- Adding a separate monitoring backend outside the running service process.

## Decisions

### Add an explicit ingress mode enum instead of a boolean
Configuration will gain `server.ingress_mode` with supported values `websocket-only` and `websocket-with-webhook-fallback`, defaulting to `websocket-only`.

This is preferred over a boolean such as `enable_webhook_fallback` because the enum directly describes the ingress policy in health output and keeps the model extensible if a future `webhook-only` mode is needed.

### Keep WebSocket transport state separate, but align recovery semantics with effective availability
Even when webhook fallback mode is enabled, WebSocket remains the primary transport and should continue to be reported explicitly in health output. However, the meaning of `service_reconnected` should align with the same ingress-mode-aware availability rules used by health, so the system does not claim a bot is available while withholding the corresponding recovery notification under the same policy.

This means:
- `service_online` remains tied to the first successful WebSocket connection in the current process session.
- `service_reconnected` becomes an ingress-mode-aware recovery signal:
  - in `websocket-only` mode, recovery still requires WebSocket connectivity
  - in `websocket-with-webhook-fallback` mode, recovery may be satisfied either by restored WebSocket connectivity or by recent webhook fallback activity that makes the bot effectively available again

Alternative considered:
- Keep `service_reconnected` as WebSocket-only while health becomes ingress-mode-aware. Rejected because it would create two incompatible definitions of "recovered" inside the same operator model.

### Add webhook observation state rather than synthetic webhook "connectivity"
Webhook health will be modeled from observed ingress traffic, not from a fake connection state. Each bot will track whether webhook fallback is enabled, whether webhook ingress is configured, and the most recent webhook event timestamp/type observed by the bot-scoped HTTP event endpoint.

Alternative considered:
- Treat endpoint existence as webhook health. Rejected because exposing an HTTP handler does not prove Feishu is using that path.

### Redefine `ready` in terms of effective availability under the configured ingress mode
The canonical health snapshot will separate:
- process health: the service is running and serving `/health`
- transport health: WebSocket state and webhook observations
- effective availability: whether a bot is currently serviceable under the configured ingress mode

The top-level `ready` flag will mean "every active bot is serviceable under the configured ingress mode". A separate degraded signal will indicate that at least one bot is relying on fallback or is otherwise not on its primary transport.

Alternative considered:
- Keep `ready` bound to WebSocket connection and add a second top-level availability flag. Rejected because the current operator confusion stems from `ready` sounding like overall serviceability while actually meaning transport-only readiness.

### Use a recent-webhook-event window for fallback availability
In `websocket-with-webhook-fallback` mode, webhook fallback will contribute to effective availability only when a recent webhook event has been observed for that bot inside a bounded recency window. This avoids treating historical webhook traffic as proof of current availability.

The initial implementation should use a fixed recency window in code rather than a new config setting.

### Reconnect heartbeat evaluation must reuse the same availability predicate as health
The periodic reconnect evaluator should not define a second notion of "healthy". Instead, each heartbeat tick should evaluate whether the bot is effectively available under the configured ingress mode using the same predicate that powers `health.ready` and `botHealth.<id>.availability.ingressAvailable`.

Conceptually:

```text
every minute
  determine ingressAvailable(now, ingressMode, websocketState, webhookRecent)
  if ingressAvailable
    record availability success at now
    compare now with previous successful availability timestamp
    if gap >= reconnect threshold
      emit service_reconnected
```

This keeps bot availability reporting and reconnect-notification behavior aligned.

## Data Model

The canonical health snapshot should evolve conceptually toward:

```text
AppHealthSnapshot
  ok: boolean
  loadedAt: string
  bots: string[]
  ingressMode: 'websocket-only' | 'websocket-with-webhook-fallback'
  ready: boolean
  degraded: boolean
  botHealth: Record<string, BotIngressHealth>
```

```text
BotIngressHealth
  websocket:
    state: connected | connecting | reconnecting | disconnected
    lastConnectedAt?
    nextReconnectAt?
    consecutiveReconnectFailures: number
    warning?
  webhook:
    enabled: boolean
    configured: boolean
    lastEventReceivedAt?
    lastEventType?
    stale: boolean
  availability:
    ingressAvailable: boolean
    activeIngress: websocket | webhook | unknown
    degraded: boolean
    summary: string
```

## Availability Rules

### `websocket-only`

For each bot:
- `availability.ingressAvailable = websocket.state === 'connected'`
- `availability.activeIngress = 'websocket'` when connected, otherwise `unknown`
- `availability.degraded = websocket.state !== 'connected'`

Top-level:
- `ready = every bot has ingressAvailable = true`
- `degraded = any bot has degraded = true`

Webhook observations remain visible for debugging but do not affect readiness in this mode.

Reconnect evaluation in this mode uses the same predicate, so `service_reconnected` fires only after a sufficiently large gap between successful WebSocket-backed availability checks.

### `websocket-with-webhook-fallback`

For each bot:
- `webhookRecent = lastEventReceivedAt is within the webhook recency window`
- `availability.ingressAvailable = websocket.state === 'connected' || webhookRecent`
- `availability.activeIngress = 'websocket'` when connected; otherwise `webhook` when webhookRecent; otherwise `unknown`
- `availability.degraded = availability.ingressAvailable && websocket.state !== 'connected'`

Top-level:
- `ready = every bot has ingressAvailable = true`
- `degraded = any bot has degraded = true`

Reconnect evaluation in this mode uses the same predicate, so `service_reconnected` may be emitted after a sufficiently large gap once either WebSocket connectivity or recent webhook fallback activity makes the bot effectively available again.

## Surface Behavior

### HTTP `/health`
Returns the full canonical JSON contract and remains the source of truth for CLI and Feishu health rendering.

### `kfc health`
Continues to read the running service's loopback `/health` endpoint and prints the canonical JSON without inventing local synthetic state.

### Feishu `/health`
Renders a summarized card from the same snapshot. In addition to readiness, it should show:
- ingress mode
- whether each bot is available
- the active ingress transport
- whether the bot is degraded
- current WebSocket state
- webhook fallback status and last observed webhook event time when present

This lets operators understand states such as "WebSocket reconnecting, webhook fallback active" directly from chat.

### `service_reconnected`
The reconnect-notification evaluator must use the same ingress-mode-aware availability predicate as health. This keeps the operator-visible answers to "is the bot available again?" consistent across:
- HTTP `/health`
- `kfc health`
- Feishu `/health`
- proactive `service_reconnected` notifications

The notification content should still expose transport detail so operators can see whether recovery happened on WebSocket or on webhook fallback.

## Risks / Trade-offs

- [Webhook fallback availability is inferred from recent traffic, not guaranteed connectivity] → Make the card and JSON explicitly describe webhook observations rather than implying a persistent webhook connection.
- [Changing `ready` and reconnect semantics may break operator assumptions or tests] → Update docs and tests together, and expose enough detail (`activeIngress`, `degraded`, transport subfields) for downstream callers to interpret the transition.
- [Health schema expansion increases payload size] → Keep HTTP detailed, and keep Feishu summarized while still deriving strictly from the same underlying snapshot.
