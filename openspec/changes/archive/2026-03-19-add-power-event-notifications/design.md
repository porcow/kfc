## Context

The current proactive service-event model is centered on service availability:

- `service_online`
- `service_reconnected`

Those events are useful for diagnostics, but the operator's primary question is simpler: "is the host going to sleep?" and "has the host woken up?" Existing reconnect semantics are not a clean substitute, especially now that reconnect evaluation is availability-driven and may fire during conditions that do not map neatly to user-visible power transitions.

The service already has a natural place for bot-scoped proactive events and subscriber fan-out. The missing piece is a power-event source plus a policy decision about how those power events relate to service availability and default subscriptions.

## Goals / Non-Goals

**Goals:**
- Add explicit `system_sleeping` and `system_woke` event types.
- Deliver `system_sleeping` on a best-effort basis when the service still has a runnable window before sleep fully takes effect.
- Deliver `system_woke` as soon as wake has been observed and effective service availability is restored enough to send the Feishu notification.
- Record `lastSleepAt` and `lastWakeAt` in memory so reconnect and power-event diagnostics can explain what recently happened.
- Make power events the default operator-facing service notifications.
- Keep `service_online` and `service_reconnected` available as diagnostic event types, but stop auto-subscribing them by default.

**Non-Goals:**
- Replace power-event observation with lid-angle or clamshell-state polling.
- Remove `service_online` or `service_reconnected` from the event model.
- Build a full user-facing subscription-management UI in the same change unless the existing command surface already needs to expose it.
- Make sleep notifications perfectly reliable; the design remains best-effort for pre-sleep delivery.

## Decisions

### 1. Model power notifications as first-class service event types

`system_sleeping` and `system_woke` should join the existing `ServiceEventType` union instead of being encoded as special log-only states or shoehorned into reconnect events.

Why this approach:
- They are real operator-facing notifications, not just implementation details.
- They fit the existing service-event subscription and card-delivery model cleanly.

Alternative considered:
- Reuse `service_reconnected` for wake and add only a sleep log. Rejected because it keeps power-state semantics implicit and mismatched with the operator's goal.

### 2. Keep power state and service availability as separate concepts

Power events should not replace availability logic. Instead:
- `system_sleeping` answers "sleep was observed and the service still had time to attempt a notification"
- `system_woke` answers "wake was observed, and the service is now available enough to notify"
- `service_online` / `service_reconnected` continue answering service-availability questions

Why this approach:
- Wake does not guarantee availability at the same instant.
- Availability does not necessarily explain whether the host slept or woke.

Alternative considered:
- Merge `system_woke` into `service_reconnected`. Rejected because reconnect thresholds and availability gaps are not the same thing as host power recovery.

### 3. Gate `system_woke` on restored service availability

Wake observation alone should not immediately send a Feishu message if the service cannot yet talk to Feishu. The implementation should:
- mark a pending wake notification when wake is observed
- deliver `system_woke` as soon as effective availability becomes true afterward
- clear the pending wake once sent

Why this approach:
- It matches the operator's intent: wake should be reported as soon as the bot can successfully notify.
- It avoids pretending the service can notify at wake time when the network and long connection are not yet ready.

Alternative considered:
- Emit `system_woke` immediately at wake regardless of sendability. Rejected because failed wake notifications would miss the core operator goal.

### 4. Make `system_sleeping` best-effort and keep it independent from later wake

Sleep notifications should be attempted immediately when sleep is observed, with no guarantee they succeed before the host fully sleeps. Failure to deliver `system_sleeping` must not block later `system_woke`.

Why this approach:
- The runnable window before full sleep may be extremely short.
- It preserves a simple operator contract: sleep is opportunistic, wake is recovered-and-delivered.

Alternative considered:
- Delay sleep notification until some later time or combine it with wake. Rejected because it loses the host-intent signal entirely.

### 5. Default subscription semantics shift to power events

Allowlisted users should be auto-subscribed by default to:
- `system_sleeping`
- `system_woke`

but not to:
- `service_reconnected`

`service_online` can either stay default-enabled for bootstrap observability or also become diagnostic-only; the preferred direction is to keep it available but not position it as the primary operator alert. The minimal version of this change should at least make `service_reconnected` no longer default-enabled.

Why this approach:
- It matches the operator's stated priorities.
- It reduces reconnect-notification noise when power events already satisfy the primary need.

Alternative considered:
- Keep auto-subscribing all existing service events and add power events on top. Rejected because it preserves redundant notifications as the default experience.

### 6. Record `lastSleepAt` and `lastWakeAt` as diagnostic context, not as availability truth

The service should keep recent power timestamps in memory for logging, debugging, and optional health diagnostics. These timestamps can help classify reconnect and wake behavior, but they should not replace the canonical availability predicate.

Why this approach:
- It provides a timeline for explaining why notifications happened during or around sleep windows.
- It avoids turning power state into a misleading proxy for serviceability.

Alternative considered:
- Use power state as a hard gate for reconnect and availability logic. Rejected because power state is not equivalent to actual bot serviceability.

## Risks / Trade-offs

- [Risk] `system_sleeping` may often fail to deliver because the host enters sleep too quickly. → Mitigation: define it explicitly as best-effort and keep a separate `system_woke` path that can still inform the operator after recovery.
- [Risk] Operators may find `system_woke` and `service_reconnected` redundant when both are enabled. → Mitigation: make power events the default subscription set and keep reconnect as opt-in diagnostic signal.
- [Risk] Power-event observation APIs on macOS may be less portable or more operationally sensitive than existing WebSocket logic. → Mitigation: keep power integration isolated to a small bridge/observer component and do not entangle it with the canonical availability predicate.
- [Risk] Wake may be observed before Feishu is reachable, delaying `system_woke`. → Mitigation: define the event as "wake observed and now deliverable" rather than "wake instant."

## Migration Plan

1. Add new service event types and card rendering for `system_sleeping` and `system_woke`.
2. Add a power-event observer that reports sleep and wake into the service runtime.
3. Track `lastSleepAt` / `lastWakeAt` in memory and include them in logs/diagnostics.
4. Add pending wake-notification state so wake can be delivered once availability returns.
5. Change default subscription reconciliation so power events are auto-enabled and reconnect becomes diagnostic-only by default.
6. Update specs, README, and manual verification guidance to reflect the new operator-facing event model.

## Open Questions

- Whether `service_online` should remain default-enabled or also move to diagnostic-only alongside `service_reconnected`.
- Whether `/server health` should expose the recent power timestamps directly in the first version or leave them to logs and future diagnostic surfaces.
