## 1. Persistence

- [x] 1.1 Add a persisted actor-scoped quiet-hours model and repository helpers for get/set/enable/disable operations
- [x] 1.2 Add time-window evaluation helpers, including cross-midnight handling and strict `HH:mm:ss` validation

## 2. Feishu command surface

- [x] 2.1 Add `/shutup from HH:mm:ss to HH:mm:ss` handling that saves the window and enables it immediately
- [x] 2.2 Add `/shutup status`, `/shutup on`, and `/shutup off` handling with user-facing cards and validation errors
- [x] 2.3 Update `/help` to advertise `/shutup` and document its supported subcommands
- [x] 2.4 Include host-local time zone context in `/shutup status`

## 3. Service-event delivery

- [x] 3.1 Apply quiet-hours gating to proactive delivery of `system_sleeping`, `system_woke`, `service_online`, and `service_reconnected`
- [x] 3.2 Ensure quiet-hours suppression does not mutate or remove the underlying service-event subscriptions
- [x] 3.3 Evaluate deferred notifications against the event timestamp being sent rather than the current delivery-attempt timestamp

## 4. Verification

- [x] 4.1 Add service-layer tests for `/shutup` parsing, state changes, and status rendering
- [x] 4.2 Add delivery-layer tests proving the four muted event types are suppressed inside quiet hours and delivered outside quiet hours
- [x] 4.3 Add repository or service reconciliation coverage proving quiet-hours preferences survive allowlist removal and re-add
- [x] 4.4 Update manual verification guidance for quiet-hours command behavior and service-event suppression
