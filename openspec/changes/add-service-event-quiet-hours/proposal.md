## Why

Host power and service-availability notifications are useful for diagnostics, but they can become noisy during predictable off-hours. Operators need a Feishu-native way to suppress these proactive notifications during configured quiet hours without disabling the underlying subscriptions.

## What Changes

- Add Feishu command `/shutup` so an authorized user can configure service-event quiet hours for the current bot.
- Support `/shutup from HH:mm:ss to HH:mm:ss` to save a quiet-hours window and enable it immediately.
- Support `/shutup status` to show the current quiet-hours window, enabled state, current in-window status, and affected event types.
- Support `/shutup on` and `/shutup off` to enable or disable the saved quiet-hours configuration without deleting it.
- Suppress proactive delivery of `system_sleeping`, `system_woke`, `service_online`, and `service_reconnected` while an authorized user's quiet-hours configuration is enabled and the event falls within the configured window.
- Preserve subscription state while quiet hours are active; quiet hours gate delivery rather than modifying event subscriptions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: add Feishu-facing quiet-hours commands and suppress service-event notifications during configured quiet hours.

## Impact

- Affected code: Feishu command parsing and help rendering in `src/service.ts` and `src/feishu/cards.ts`
- Affected code: service-event delivery flow in `src/feishu/sdk.ts`
- Affected code: persistence schema and repository methods in `src/persistence/run-repository.ts`
- Affected behavior: proactive delivery for `system_sleeping`, `system_woke`, `service_online`, and `service_reconnected`
