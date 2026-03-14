## 1. Built-In Tool And Detection Logic

- [x] 1.1 Add the `checkPDWin11` built-in tool entrypoint and register it in the built-in tool catalog.
- [x] 1.2 Implement macOS process-list inspection that matches Parallels Desktop Windows 11 VM processes and parses a usable process start time.
- [x] 1.3 Handle ambiguous or unparsable process observations safely so the tool invocation fails without mutating persisted monitor state.

## 2. Persistent Monitor State

- [x] 2.1 Add durable bot-scoped, task-scoped monitor-state storage for `PDWin11State`, detected start time, and last transition metadata.
- [x] 2.2 Load the persisted monitor state at the start of each tool invocation and update it only after a successful observation.
- [x] 2.3 Ensure monitor-state persistence survives service restart and separate cronjob invocations.

## 3. Transition Detection And Notifications

- [x] 3.1 Implement the four transition branches `off -> on`, `on -> on`, `on -> off`, and `off -> off`.
- [x] 3.2 Define and implement a structured notification-intent result contract for `checkPDWin11` transition outputs instead of direct SDK calls inside the tool.
- [x] 3.3 Add proactive Feishu notification delivery in the bot-scoped outer execution layer for `off -> on` and `on -> off` using the task's fixed notification destination and the `botId` from `kfc exec`.
- [x] 3.4 Format startup and shutdown messages with detected lifecycle times and human-readable runtime duration values.

## 4. Configuration And Cronjob Integration

- [x] 4.1 Extend task configuration validation for `checkPDWin11` to require a fixed notification destination and to default the VM display-name match to `Windows 11` when omitted.
- [x] 4.2 Ensure the tool works through the existing `kfc exec --bot BOT_ID --task TASK_ID` execution path used by launchd-managed cronjobs and preserves the correct bot-scoped delivery context.
- [x] 4.3 Document and verify the intended cronjob configuration for running `checkPDWin11` as a periodic polling task.

## 5. Verification And Documentation

- [x] 5.1 Add tests covering all four state transitions and duplicate-notification suppression.
- [x] 5.2 Add tests covering bot-scoped notification-intent delivery through `kfc exec --bot ...`, including the case where the tool itself has no direct Feishu client.
- [x] 5.3 Add tests covering persisted-state recovery across restart and process-start-time parse failures.
- [x] 5.4 Add documentation for operators describing required task config, polling accuracy limits, notification content, and expected cronjob usage.
