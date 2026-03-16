## Context

The current bot connection notification flow mixes two different concerns:

- `service_online` is a process-session concept
- `service_reconnected` is currently derived from WebSocket outage-state transitions

That reconnect model is sensitive to transport churn because it depends on entering and leaving `reconnecting` / `disconnected` states. The new requirement is to keep `service_online` session-based while redefining `service_reconnected` around successful heartbeat observations instead of raw outage transitions.

## Goals / Non-Goals

**Goals:**

- Keep `service_online` scoped to the first successful Feishu long-connection in the current main-service process session.
- Redefine `service_reconnected` to use heartbeat-success gaps instead of reconnect/disconnect transition windows.
- Persist heartbeat-success timestamps so reconnect decisions survive process restarts.
- Change the reconnect threshold default to 1 hour.

**Non-Goals:**

- Introducing user-facing subscribe/unsubscribe management beyond the existing allowlist-derived default subscriptions.
- Changing the delivery channel away from user-directed Feishu notifications.
- Reworking `/health` into the source of truth for reconnect notifications.
- Making the heartbeat cadence configurable in v1.

## Decisions

### `service_online` remains session-scoped and tied to first successful `connected`

`service_online` will continue to use process-memory deduplication for the current bot runtime session. The first successful Feishu WebSocket `connected` state after the main service starts will emit `service_online`, and later reconnects in the same process session will not emit it again.

This preserves the intended "bot came online after service startup" meaning and avoids conflating routine reconnects with cold-start availability.

### `service_reconnected` is derived from heartbeat success gaps, not outage transitions

Instead of persisting `last_disconnected_at` and measuring an outage window from state transitions, the runtime will maintain a lightweight heartbeat evaluator:

```text
every minute
  if websocket state is connected
    record heartbeat success at now
    compare now with previous successful heartbeat timestamp
    if gap >= threshold
      emit service_reconnected
```

The trigger is therefore:

- current heartbeat check succeeds
- a prior successful heartbeat exists
- elapsed time between the current and prior successful heartbeats is at least the reconnect threshold

This intentionally ignores reconnect/disconnect chatter and focuses on the durable absence of successful connectivity confirmation.

Alternative considered:

- keep the current outage-state model and just raise the threshold

Rejected because it still depends on transient transport state transitions rather than on a durable success-based signal.

### Heartbeat cadence is fixed at one minute in v1

The service will run a per-bot heartbeat evaluation loop at a fixed cadence of one minute.

This is frequent enough to detect recovery within a bounded delay, while remaining simple and avoiding new config surface in the first revision.

Alternative considered:

- expose a configurable heartbeat interval

Rejected for v1 to keep the migration focused on reconnect semantics rather than scheduler tuning.

### Persisted service event state shifts from outage tracking to heartbeat tracking

The persisted bot service-event state will move from outage-window bookkeeping toward heartbeat-success bookkeeping. The important persisted fields become:

- `last_connected_at`
- `last_heartbeat_succeeded_at`
- `last_reconnected_notified_at`

`last_disconnected_at` is no longer the source of truth for reconnect detection.

This gives the runtime a restart-safe record of the last successful heartbeat and the last reconnect notification time, without needing to rebuild an outage window from raw WebSocket state transitions.

Because this upgrade will be applied only after `kfc uninstall` removes the existing working directory and sqlite state, the persistence layer may switch directly to the new schema without backward-compatible reads for historical `service_event_state` rows.

### Reconnect threshold default becomes 1 hour

The global reconnect threshold remains configuration-driven, but its semantics change:

- it now measures the gap between two successful heartbeat timestamps
- the default becomes `3600000` milliseconds

This better matches the new requirement that reconnect notifications represent a material interruption in successful connectivity, not short-lived transport churn.

## Risks / Trade-offs

- [Heartbeat loop misses a very short recovery window] -> acceptable; the design intentionally favors stable reconnect semantics over immediate transport-level sensitivity.
- [A bot remains disconnected for a long time and only notifies on the next successful heartbeat] -> intentional; `service_reconnected` is a recovery signal, not an outage signal.
- [Changing persisted state fields could leave stale historical rows in place] -> this rollout requires uninstalling the existing service first, so the new runtime may initialize a clean sqlite schema without backward-compatibility code.
- [Fixed 1-minute heartbeat cadence may not fit every deployment] -> keep cadence internal in v1 and revisit only if operational evidence demands configurability.

## Migration Plan

1. Replace reconnect notification logic in the Feishu bridge with a per-bot heartbeat-success evaluator.
2. Update persisted service-event state reads/writes to use heartbeat-success timestamps.
3. Preserve `service_online` session-memory behavior while removing reconnect dependence on `last_disconnected_at`.
4. Change the default reconnect threshold to 1 hour and update docs/tests accordingly.
5. Roll forward against a newly created sqlite database after uninstall/reinstall, with no requirement to read historical `service_event_state` rows.

Rollback:

- revert to the previous outage-transition-based reconnect detection
- keep subscription delivery unchanged
- recreate the service from a fresh install if rollback is needed, rather than reading mixed old/new sqlite state

## Open Questions

None for v1. The heartbeat cadence, reconnect threshold source, and notification semantics are all fixed by this change.
