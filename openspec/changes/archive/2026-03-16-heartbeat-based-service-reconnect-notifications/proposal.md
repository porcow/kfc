## Why

The current bot connection notification model treats reconnects as WebSocket state transitions, which makes the `service_reconnected` event depend on short-lived transport state changes rather than on a durable gap in successful connectivity checks. We need a more stable reconnect signal that reflects a meaningful loss of confirmed bot connectivity and a clear recovery boundary.

## What Changes

- Change `service_online` so it is triggered only when a bot establishes its first successful Feishu long-connection after the main service process starts.
- Replace `service_reconnected` trigger semantics with a heartbeat-based mechanism rather than direct outage-window state transitions.
- Persist bot heartbeat success timestamps and compare the current successful heartbeat time against the previous successful heartbeat time.
- Trigger `service_reconnected` only when the bot is currently connected and the elapsed time since the previous successful heartbeat exceeds a configured threshold.
- Introduce a new reconnect threshold default of 1 hour for the heartbeat-based reconnect decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: change when proactive `service_online` and `service_reconnected` Feishu notifications are emitted.
- `local-task-execution-audit`: change the persisted connection-check data model and the reconnect detection rules from outage-state tracking to heartbeat-success tracking.

## Impact

- Affected code: Feishu SDK bridge, bot runtime connection monitoring, service-event persistence, config parsing, and Feishu notification card delivery.
- Affected data model: persisted service-event state used for online/reconnect decisions.
- Affected configuration: reconnect notification threshold semantics and default value.
- Affected operator behavior: reconnect notifications become based on heartbeat-success gaps rather than reconnecting/disconnected state transitions.
