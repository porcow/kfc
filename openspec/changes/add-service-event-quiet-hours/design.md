## Context

Kids Alfred already persists actor-scoped service-event subscriptions and proactively delivers four event types through Feishu: `system_sleeping`, `system_woke`, `service_online`, and `service_reconnected`. Today these notifications are either enabled or disabled at the subscription layer, with no time-of-day suppression. The new `/shutup` command family needs to let an authorized Feishu user silence those proactive notifications during a predictable daily window without changing subscription membership.

The current architecture is favorable for this change:

- Feishu text commands are parsed in `src/service.ts`
- proactive service-event notifications are sent from `sendServiceEventNotification()` in `src/feishu/sdk.ts`
- actor-scoped subscription data is stored in `RunRepository`

That means quiet hours can be introduced as a separate actor preference and enforced at one delivery choke point.

## Goals / Non-Goals

**Goals:**

- Add a Feishu-native way to set, inspect, enable, and disable service-event quiet hours
- Apply quiet hours per authorized actor and per bot
- Suppress only proactive service-event notifications, not task replies, status cards, or cron fan-out messages
- Support both same-day and cross-midnight time windows
- Keep event subscriptions intact while quiet hours are active

**Non-Goals:**

- Adding chat-scoped quiet hours
- Adding per-event-type customization in the first iteration
- Changing allowlist or subscription semantics
- Adding time zone selection per user
- Retrofitting quiet hours onto cron task notifications such as `checkPDWin11`

## Decisions

### 1. Model quiet hours as a separate persisted preference

Quiet hours should not be embedded into `service_event_subscriptions`. Subscriptions answer "should this actor ever receive this event type?" while quiet hours answer "should delivery be suppressed at this moment?".

Chosen approach:

- add a separate actor-scoped quiet-hours record in the bot's SQLite store
- store:
  - `actor_id`
  - `enabled`
  - `from_time`
  - `to_time`
  - timestamps

Why:

- keeps subscription data model simple
- makes `/shutup on/off` independent from subscription mutation
- leaves room for future expansion without overloading subscription rows

Alternative considered:

- extending `service_event_subscriptions` with quiet-hours columns
- rejected because it mixes per-event subscription state with cross-event actor preferences and makes default subscription reconciliation harder to reason about

### 2. Enforce quiet hours at proactive delivery time

Quiet hours should gate delivery in `sendServiceEventNotification()` rather than changing event generation or subscription lookup.

Chosen approach:

- resolve subscribed actors as today
- for each actor, check whether:
  - quiet hours exist
  - quiet hours are enabled
  - the event type is in the muted set
  - the event timestamp falls inside the configured window
- skip delivery only when all conditions match

Why:

- single enforcement point for all service events
- does not distort event production or service health bookkeeping
- keeps `/shutup off` lightweight because no subscriptions need to be rebuilt

Alternative considered:

- suppressing events earlier in each power/reconnect handler
- rejected because it would duplicate the same logic across multiple paths and increase drift risk

### 3. Scope quiet hours per actor and per bot

The quiet-hours setting should apply to the actor receiving open-id notifications inside the current bot runtime.

Chosen approach:

- store quiet hours in each bot's SQLite database keyed by `actor_id`

Why:

- matches current proactive delivery model, which targets actors rather than chats
- allows the same person to configure different quiet hours on different bots

Alternative considered:

- chat-scoped quiet hours
- rejected because service events are not delivered to chats

### 4. Interpret windows in host-local time and support cross-midnight ranges

The input format should remain `/shutup from HH:mm:ss to HH:mm:ss`.

Chosen approach:

- validate exact `HH:mm:ss` 24-hour format
- reject `from == to` to avoid ambiguous all-day behavior
- evaluate in the bot host's local time zone
- use:
  - `from <= to`: in window when `from <= now < to`
  - `from > to`: in window when `now >= from || now < to`

Why:

- simple mental model for operators
- cross-midnight support is required for realistic off-hours windows

Alternative considered:

- storing absolute timestamps or weekday-aware schedules
- rejected as unnecessary for the initial feature

Additional decision:

- `/shutup status` should explicitly display the bot host's local time zone label or offset alongside the saved clock times

Why:

- the feature is evaluated in host-local time rather than user-local time
- surfacing the time zone in status reduces operator confusion when Feishu users are remote or traveling

### 5. Include `service_online` in the muted set

The quiet-hours muted event set should include:

- `system_sleeping`
- `system_woke`
- `service_online`
- `service_reconnected`

Why:

- the user explicitly expanded the scope to include `service_online`
- these four events all originate from the same proactive service-event channel

### 6. Preserve quiet-hours records across allowlist churn

Quiet-hours preferences should survive temporary allowlist removal and later re-authorization.

Chosen approach:

- do not delete persisted quiet-hours records during allowlist reconciliation
- only enforce quiet hours for currently authorized, subscribed actors who are eligible for delivery

Why:

- quiet hours are actor preference data, not authorization data
- deleting them on allowlist churn would create surprise and extra reconfiguration work

Alternative considered:

- deleting quiet-hours records whenever an actor is removed from the allowlist
- rejected because the existing change does not require aggressive cleanup and there is little value in coupling preference lifecycle to allowlist churn

## Risks / Trade-offs

- Quiet hours are evaluated in host-local time rather than user-local time
  → Mitigation: make `/shutup status` explicitly display only the raw configured times and whether the current host-local time is inside the window

- A deferred `system_woke` notification may be delivered later than the actual wake time
  → Mitigation: evaluate quiet hours against the event timestamp being sent, not the eventual delivery attempt time

- Subscription reconciliation currently auto-enables default power-event subscriptions for allowlisted users
  → Mitigation: keep quiet-hours storage independent so reconciliation can preserve user preference without re-enabling delivery

- The command name `/shutup` is intentionally user-facing slang while internal design uses "quiet hours"
  → Mitigation: keep `/shutup` only at the Feishu command boundary and use `quiet hours` naming in persistence and design artifacts

## Migration Plan

1. Add a new SQLite table for actor-scoped service-event quiet hours with repository helpers.
2. Add `/shutup` command parsing, validation, status rendering, and help-card text.
3. Apply quiet-hours gating in service-event delivery for the four muted event types.
4. Add tests for:
   - command parsing and validation
   - cross-midnight window evaluation
   - status rendering including host-local time zone context
   - status rendering
   - suppression of each applicable event type
   - allowlist removal and re-add preserving quiet-hours preferences
5. Rollback is low risk: if the feature must be reverted, ignore the new table and remove the command surface; existing subscriptions remain intact.
