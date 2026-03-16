## 1. Heartbeat Detection

- [x] 1.1 Replace reconnect notification logic so `service_reconnected` is derived from successful heartbeat gaps rather than reconnect/disconnect transition windows.
- [x] 1.2 Add a fixed one-minute per-bot heartbeat evaluation loop that checks whether the bot is currently `connected`.
- [x] 1.3 Keep `service_online` session-scoped to the first successful `connected` state after main-service startup.

## 2. Persistence and Configuration

- [x] 2.1 Update persisted service-event state to store heartbeat-success timestamps used for reconnect decisions.
- [x] 2.2 Change reconnect threshold semantics and default value to `3600000` milliseconds.
- [x] 2.3 Replace the old outage-window service-event schema directly, assuming uninstall/reinstall clears historical sqlite state for this upgrade.

## 3. Notifications and Verification

- [x] 3.1 Update Feishu connection-event notification flows and card content to reflect heartbeat-gap-based reconnect semantics.
- [x] 3.2 Add or update tests for service-online session behavior, heartbeat-gap reconnect behavior, and threshold-default behavior.
- [x] 3.3 Update operator-facing docs to explain the new heartbeat-based reconnect trigger.
