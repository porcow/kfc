## 1. Power event model

- [x] 1.1 Extend service event types, card rendering, and delivery plumbing to support `system_sleeping` and `system_woke`
- [x] 1.2 Add in-memory power diagnostics state for `lastSleepAt`, `lastWakeAt`, and pending wake notification tracking

## 2. Power observation and notification flow

- [x] 2.1 Add a macOS power-event observer that reports sleep and wake events into the bot/service runtime
- [x] 2.2 Attempt `system_sleeping` delivery immediately on observed sleep as a best-effort notification
- [x] 2.3 Record wake events and deliver `system_woke` as soon as effective service availability is restored after wake
- [x] 2.4 Keep `service_online` and `service_reconnected` as diagnostic events without breaking existing service-health and logging flows

## 3. Default subscription behavior and docs

- [x] 3.1 Change allowlist reconciliation so power events are default-enabled and `service_reconnected` is no longer default-subscribed
- [x] 3.2 Add tests covering sleep-event best-effort behavior, wake-event deferred delivery, and changed default subscription semantics
- [x] 3.3 Update README and manual verification guidance for the new power-event notification model
