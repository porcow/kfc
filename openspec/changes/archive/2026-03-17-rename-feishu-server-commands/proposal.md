## Why

The Feishu command surface currently mixes service-oriented operations into the generic `/run` namespace and exposes health as `/health`, which makes operator commands less explicit than they need to be. We want a clearer Feishu-only command vocabulary without changing the underlying health, update, or rollback behavior.

## What Changes

- Rename the Feishu health command from `/health` to `/server health`.
- Rename the Feishu self-update command from `/run update` to `/server update`.
- Rename the Feishu rollback command from `/run rollback` to `/server rollback`.
- Keep the underlying service health, self-update, rollback, confirmation, execution, and result semantics unchanged.
- Limit the scope to the Feishu interaction layer, including help text, command parsing, card copy, and Feishu-facing specs/docs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feishu-task-interaction`: Change the Feishu-visible service command names from `/health`, `/run update`, and `/run rollback` to `/server health`, `/server update`, and `/server rollback`.
- `local-task-execution-audit`: Rename the Feishu-facing health/update/rollback entrypoints referenced by the shared audit workflow without changing the underlying update, rollback, or health execution behavior.

## Impact

- Affected code: `src/service.ts`, `src/feishu/cards.ts`, and Feishu command/help tests.
- Affected specs/docs: `openspec/specs/feishu-task-interaction/spec.md`, `openspec/specs/local-task-execution-audit/spec.md`, `README.md`, and any Feishu command documentation.
- No new dependencies or external integrations.
