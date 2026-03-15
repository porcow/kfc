## 1. Config Parsing

- [x] 1.1 Remove automatic `sc` injection from bot task parsing while keeping `sc` reserved-task validation
- [x] 1.2 Add or update config tests to cover both “missing `sc` means unavailable” and “explicit `sc` remains constrained to screencapture”

## 2. Feishu Task Surface

- [x] 2.1 Update `/tasks`, `/help`, and unsupported-command messaging so `/run sc` is only advertised when the current bot has configured `sc`
- [x] 2.2 Verify `/run sc` now follows the normal unknown-task path when `sc` is not configured for that bot

## 3. Samples And Docs

- [x] 3.1 Change example config to declare `[bots.<id>.tasks.sc]` explicitly where screenshot support is intended
- [x] 3.2 Update README and manual verification guidance to explain that each bot must opt in to `sc`

## 4. Verification

- [x] 4.1 Run the relevant config, service, and screencapture-related test suites
- [x] 4.2 Validate the OpenSpec change and ensure the new tasks checklist is complete
