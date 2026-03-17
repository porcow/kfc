## Context

The service currently exposes several operator-facing actions through Feishu text commands: `/health`, `/run update`, and `/run rollback`. Those commands are routed inside the same Feishu interaction layer that also handles generic task execution (`/run TASK_ID ...`) and informational commands such as `/tasks`.

The requested change is intentionally narrow: keep the underlying health snapshot, self-update workflow, rollback workflow, confirmation cards, run audit records, and local `kfc` commands exactly as they are today, while renaming the Feishu entrypoints to a clearer `/server ...` namespace for service-oriented operations.

## Goals / Non-Goals

**Goals:**
- Rename the Feishu health command to `/server health`.
- Rename the Feishu service update command to `/server update`.
- Rename the Feishu service rollback command to `/server rollback`.
- Keep all underlying behaviors, permissions, confirmation flows, and result semantics unchanged.
- Update Feishu help text, informational cards, and specs/docs so they advertise only the new command names for these operations.

**Non-Goals:**
- Do not change HTTP `/health` or `kfc health`.
- Do not change `kfc update` or `kfc rollback`.
- Do not change generic task execution syntax such as `/run TASK_ID key=value ...`.
- Do not change task configuration requirements for `update` or `rollback`.
- Do not add aliases or a long-lived compatibility mode unless explicitly requested later.

## Decisions

### 1. Service-oriented Feishu commands move under a dedicated `/server` namespace

Feishu-facing service commands become:
- `/server health`
- `/server update`
- `/server rollback`

This makes service-level operations visually distinct from generic task execution under `/run`.

Alternative considered:
- Keep `/health` and `/run update|rollback` and only revise help text. Rejected because it does not solve the command-surface ambiguity that motivated the change.

### 2. Only the Feishu parser and Feishu-facing copy change

Command parsing, help rendering, `/tasks` card copy, and Feishu health/result surfaces will recognize and advertise the new `/server ...` commands. The underlying execution paths remain the same:
- `/server health` still renders the canonical service health snapshot.
- `/server update` still uses the existing update confirmation and self-update workflow.
- `/server rollback` still uses the existing rollback confirmation and rollback workflow.

Alternative considered:
- Introduce separate service-specific handlers or tool IDs. Rejected because the change is naming-only and should keep the current execution model intact.

### 3. Local control-plane commands stay unchanged

`kfc health`, `kfc update`, `kfc rollback`, and HTTP `/health` remain unchanged. The `/server ...` namespace is a Feishu interaction concern, not a repo-wide control-plane rename.

Alternative considered:
- Rename local CLI commands to mirror Feishu. Rejected because the request explicitly limits the scope to Feishu interaction and the local CLI already has an established shape.

### 4. Update and rollback task visibility rules remain unchanged

Bots still expose update and rollback only when their task catalog explicitly configures `update` or `rollback`. The rename changes which Feishu command reaches those workflows, not which bots are allowed to use them.

Alternative considered:
- Treat `/server update` and `/server rollback` as globally available service commands. Rejected because it would silently broaden access compared with the current task-gated design.

## Risks / Trade-offs

- [Users still send the old Feishu commands] → Update help text, `/tasks` copy, and README together so the new vocabulary is discoverable immediately.
- [Command parsing changes accidentally affect generic `/run` handling] → Keep the rename isolated to the exact health/update/rollback branches and leave generic `/run TASK_ID ...` parsing unchanged.
- [Spec drift between Feishu interaction and shared execution docs] → Update both `feishu-task-interaction` and `local-task-execution-audit` deltas in the same change.

## Migration Plan

1. Update Feishu command parsing and help/card copy to use `/server health`, `/server update`, and `/server rollback`.
2. Keep the existing update/rollback/health execution paths wired underneath those new entrypoints.
3. Update specs, README, and tests to reflect the renamed Feishu commands.

Rollback strategy:
- Revert the Feishu command-surface change if operators need the old command names back.
- No data migration or runtime state migration is required.

## Open Questions

None. The requested scope is narrow enough to implement directly.
