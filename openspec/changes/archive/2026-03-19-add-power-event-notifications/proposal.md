## Why

The operator's primary need is to know when the host MacBook is going to sleep and when it has woken up again. Existing `service_online` and `service_reconnected` events are service-availability diagnostics, not direct power-state notifications, so they do not map cleanly onto "the machine is sleeping" or "the machine woke" as primary operator alerts.

## What Changes

- Add a new power-event notification capability that observes host sleep and wake events.
- Introduce two service-level event types:
  - `system_sleeping`: best-effort notification when the host is about to sleep or sleep is detected within the remaining runnable window
  - `system_woke`: notification sent as soon as wake has been observed and service availability is restored enough to deliver the Feishu message
- Track `lastSleepAt` and `lastWakeAt` in memory and expose them as power diagnostics for logging and optional health/diagnostic context.
- Change default service-event subscription behavior so allowlisted users are auto-subscribed to power events, while `service_reconnected` remains available as an optional diagnostic subscription instead of a default operator alert.
- Keep `service_online` and `service_reconnected` in the event model for service health, logs, and diagnostics; do not remove them from the system.

## Capabilities

### New Capabilities
- `power-event-notifications`: best-effort sleep notifications plus wake notifications that are deferred until the bot is available enough to deliver them.

### Modified Capabilities
- `local-task-execution-audit`: service-event types, subscription defaults, and diagnostic state now include host power events in addition to existing service-availability events.
- `feishu-task-interaction`: Feishu-facing proactive service-event notifications now include power-event notifications and changed default subscription semantics.

## Impact

- Affected code: Feishu SDK bridge, service-event persistence and subscription reconciliation, service-event card rendering, health/diagnostic data structures, and tests/docs around proactive notifications.
- Affected behavior: operators receive power-state notifications by default, while reconnect notifications become opt-in diagnostic events.
- No new user text command surface is required for the first version unless later work adds event-subscription management commands.
