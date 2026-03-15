## 1. Persistence

- [x] 1.1 Add bot-scoped SQLite persistence for `service_event_subscriptions`
- [x] 1.2 Add bot-scoped SQLite persistence for `service_event_state`
- [x] 1.3 Add reconcile logic that syncs `allowed_users` into default `service_online` and `service_reconnected` subscriptions

## 2. Feishu Delivery

- [x] 2.1 Extend proactive Feishu delivery to support user-directed private messaging in addition to chat-directed delivery
- [x] 2.2 Add card builders for `service_online` and `service_reconnected` notifications using canonical Feishu timestamp formatting

## 3. WebSocket Event Detection

- [x] 3.1 Add per-bot in-memory session state to track whether `service_online` has already been emitted in the current process
- [x] 3.2 Detect `connected -> outage -> connected` transitions from WebSocket health updates and persist `last_disconnected_at` / reconnect metadata
- [x] 3.3 Enforce the 5-minute outage threshold before sending `service_reconnected`

## 4. Verification

- [x] 4.1 Add or update tests for allowlist subscription reconciliation, session-scoped online notification, and long-outage reconnect notification
- [x] 4.2 Validate the OpenSpec change and confirm the task checklist is complete
