## Context

`checkPDWin11` currently decides whether the `Windows 11` VM is running by parsing `ps` output and matching `prl_vm_app` command lines. That works only as long as Parallels Desktop keeps exposing a stable helper-process shape, and it gives the project no reusable layer for future VM operations such as start, stop, suspend, or restart. The change should move VM observation onto the Parallels-supported CLI surface and leave behind a reusable abstraction instead of another task-specific command wrapper.

## Goals / Non-Goals

**Goals:**
- Make `checkPDWin11` determine VM state through `prlctl` instead of host process matching.
- Introduce a reusable Parallels CLI boundary that future builtin-tools can reuse for VM inspection and operations.
- Preserve the existing monitor state machine, runtime reminder policy, and Feishu notification behavior.
- Make failures diagnosable when `prlctl` is unavailable, the VM cannot be found, or the CLI output cannot be interpreted.

**Non-Goals:**
- Adding new VM control tasks in this change.
- Supporting non-Parallels hypervisors.
- Replacing the existing monitor notification/subscription model.
- Depending on undocumented GUI process names after this migration.

## Decisions

### Use `prlctl` as the canonical Parallels integration boundary
`checkPDWin11` will stop parsing `ps` output and instead call a reusable Parallels CLI adapter backed by `prlctl`. This is the vendor-supported interface and is more stable than helper-process matching.

Alternatives considered:
- Keep the current process-list approach: rejected because it is brittle and task-specific.
- Call `prlctl` directly inside `checkPDWin11`: rejected because future VM control tasks would duplicate parsing and error handling.

### Introduce a reusable `parallels-vm-operations` abstraction
The code path should expose a small internal interface for:
- finding a VM by configured display name
- reading its normalized state
- reading any normalized timing metadata the monitor needs
- executing future controlled `prlctl` operations

This keeps `checkPDWin11` focused on monitor state transitions and leaves command parsing, normalization, and host-level errors in one place.

Alternatives considered:
- Implement only a one-off helper for `checkPDWin11`: rejected because the user explicitly wants future extensibility for Parallels VM tasks.

### Treat `prlctl` output as normalized VM state, not raw CLI text
The adapter should parse `prlctl` responses into a normalized VM model with at least:
- VM identity
- human-configured VM name
- normalized runtime state
- any CLI-derived timestamps or metadata available for monitor calculations

If `prlctl` does not provide an exact timestamp needed by the current monitor behavior, the adapter may combine stable CLI data with the existing persisted monitor state rather than falling back to process-list matching.

The normalized runtime state should follow a conservative mapping:
- `running` -> `on`
- `stopped` -> `off`
- `suspended` -> `off`
- `paused` -> `off`
- transitional states such as `starting`, `stopping`, or `resetting` -> `failure`
- unknown or unsupported states -> `failure`

This keeps lifecycle notifications tied to stable VM states and avoids false `off -> on` or `on -> off` transitions during short-lived state changes.

### Fail monitoring invocations clearly when `prlctl` is unusable
If `prlctl` is missing, returns a non-zero status, cannot find the configured VM, or returns an unsupported shape, `checkPDWin11` should fail the invocation clearly and should not mutate persisted monitor state. This preserves the current monitor safety property.

### Keep VM identity configurable by VM display name
The current task concept is still “monitor the Parallels VM named `Windows 11`”. This change keeps that user-facing model, but routes resolution through `prlctl`. Future tasks can reuse the same resolution mechanism for other VM names without changing the abstraction.

## Risks / Trade-offs

- **`prlctl` output shape differs across versions** -> Centralize parsing in one adapter and normalize only the fields the app truly needs.
- **Some monitor timing data may not map 1:1 from the old process-based approach** -> Prefer CLI-derived metadata where available and preserve current persisted state semantics where exact timestamps are not directly exposed.
- **Host lacks Parallels CLI in PATH** -> Fail clearly with a diagnosable operator-facing error instead of silently treating the VM as off.
- **Future VM control tasks could overgrow the first abstraction** -> Keep the first adapter focused on inspection and command execution primitives, not task-specific policy.

## Migration Plan

1. Add the Parallels CLI adapter and normalized VM state model.
2. Switch `checkPDWin11` to consume the adapter instead of `ps` parsing.
3. Update tests and docs to reflect `prlctl` as the source of truth.
4. Roll back by restoring the previous `ps`-based implementation if `prlctl` integration proves unusable on target hosts.

## Open Questions

- Which exact `prlctl` commands and fields provide the most reliable VM running-state and timing metadata on the target Parallels version.
- Whether future VM operation tasks should expose one task per action or a smaller number of parameterized tasks.
