## 1. Feishu command routing

- [x] 1.1 Update Feishu command parsing so `/server health`, `/server update`, and `/server rollback` route to the existing health, self-update, and rollback behaviors
- [x] 1.2 Keep generic `/run TASK_ID ...` handling unchanged while removing the old Feishu-only `/health`, `/run update`, and `/run rollback` entrypoints from help and command dispatch

## 2. Feishu-facing copy and documentation

- [x] 2.1 Update Feishu help text, task cards, and service-oriented card copy to advertise `/server health`, `/server update`, and `/server rollback`
- [x] 2.2 Update README and related operator documentation so Feishu instructions use the new `/server ...` commands while local `kfc` commands stay unchanged

## 3. Verification

- [x] 3.1 Update automated tests covering Feishu command help, command parsing, health replies, and update/rollback command gating
- [x] 3.2 Verify the OpenSpec deltas, including `feishu-task-interaction` and `local-task-execution-audit`, fully match the implemented Feishu command surface
