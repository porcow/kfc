## Why

The service already exposes useful `/health` data over HTTP, but operators currently need direct host access or external tooling to see it. Adding local CLI and Feishu command entry points makes the same readiness view available from the two places operators already use to manage the service.

## What Changes

- Add a local CLI command `kfc health` that reads the same health data exposed by the HTTP `/health` endpoint and prints it for host operators.
- Add a Feishu text command `/health` for authorized users so health and readiness can be inspected from chat without leaving the bot interaction flow.
- Keep one canonical health payload contract so HTTP, CLI, and Feishu command surfaces stay aligned on bot list, per-bot WebSocket state, and overall readiness.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: add an authorized `/health` command that returns service and per-bot readiness through the Feishu chat interface
- `local-task-execution-audit`: extend the local `kfc` lifecycle/admin interface and health observability requirements to cover `kfc health`

## Impact

- Affected code: `src/kfc.ts`, `src/service.ts`, `src/feishu/cards.ts`, `src/http/server.ts`, and related tests/docs
- APIs: local CLI gains `kfc health`; Feishu text command set gains `/health`
- Systems: health output remains backed by the existing in-process `BotManager` health view rather than a separate monitoring store
