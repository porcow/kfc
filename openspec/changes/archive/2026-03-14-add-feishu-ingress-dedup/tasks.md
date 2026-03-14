## 1. Dedup Store

- [x] 1.1 Add a bot-scoped SQLite table for ingress dedup keys with TTL metadata.
- [x] 1.2 Add repository helpers to claim an ingress event key exactly once during the dedup window.

## 2. Feishu Ingress Handling

- [x] 2.1 Prepend dedup checks to `im.message.receive_v1` handling before business logic runs.
- [x] 2.2 Prepend dedup checks to `card.action.trigger` handling for both WebSocket and HTTP card callback paths.
- [x] 2.3 Prefer official event identifiers when available and fall back to stable synthesized keys when they are not.

## 3. Logging

- [x] 3.1 Log duplicate suppressions as structured `duplicate_suppressed` inbound-event decisions.

## 4. Verification

- [x] 4.1 Add repository tests showing a dedup key can only be claimed once within the window.
- [x] 4.2 Add SDK/handler tests showing duplicate message deliveries do not produce duplicate replies.
- [x] 4.3 Add SDK/handler tests showing duplicate card actions do not re-enter business logic.
