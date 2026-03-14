## 1. PDWin11 State Model

- [x] 1.1 Extend `PDWin11MonitorState` and SQLite persistence to store runtime-reminder timing metadata.
- [x] 1.2 Ensure `on -> off` clears runtime-reminder timing so a new VM session can trigger a fresh first-hour reminder.

## 2. Reminder Logic

- [x] 2.1 Update `checkPDWin11` to keep evaluating uptime during `on -> on` observations.
- [x] 2.2 Emit the first runtime reminder when uptime first reaches at least one hour.
- [x] 2.3 Emit subsequent runtime reminders only when at least 10 minutes have elapsed since the last successful runtime reminder.

## 3. Card Notification Contract

- [x] 3.1 Extend proactive notification intents to carry a card title in addition to the body.
- [x] 3.2 Render `checkPDWin11` startup, shutdown, and runtime reminder notifications as informational Feishu cards with the required titles.

## 4. Time and Duration Formatting

- [x] 4.1 Add a shared formatter for `YYYY/MM/DD HH:mm:ss` host-local timestamps used by `checkPDWin11` notifications.
- [x] 4.2 Use one consistent duration formatter for reminder titles and notification bodies.

## 5. Verification

- [x] 5.1 Add tool tests covering first-hour reminder, repeated 10-minute reminders, and reminder suppression before the interval elapses.
- [x] 5.2 Add delivery-layer tests covering titled proactive cards.
- [x] 5.3 Update README and manual verification steps for the new card titles and readable timestamps.
