## 1. Feishu Command Flow

- [x] 1.1 Register one-shot task `sc` so it is discoverable through `/tasks` and invokable through `/run sc`
- [x] 1.2 Update `/help` and unsupported-command guidance to point users to `/run sc`
- [x] 1.3 Add tests covering authorized `/run sc` confirmation flow and unauthorized access rejection

## 2. Screencapture Task Execution

- [x] 2.1 Register the predefined oneshot task `sc` backed by builtin-tool `screencapture`
- [x] 2.2 Capture the current screen with macOS `screencapture` and save it to `$HOME/.kfc/data/screenshot-{datetime}.png`
- [x] 2.3 Ensure capture failures surface clear task errors and do not attempt Feishu image delivery

## 3. Feishu Image Delivery

- [x] 3.1 Add Feishu SDK support for uploading the generated screenshot image and sending it back to the originating chat
- [x] 3.2 Delete the temporary screenshot file only after image delivery succeeds
- [x] 3.3 Retain the temporary screenshot file on upload/send failure and log or return a clear error

## 4. Verification and Documentation

- [x] 4.1 Add or update tests for screenshot file creation, successful cleanup, and failed-delivery retention
- [x] 4.2 Update README and manual verification guidance for `/run sc` usage and screenshot file lifecycle
