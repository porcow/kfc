## Context

The system currently supports two full uninstall entrypoints:

- `kfc uninstall`
- `uninstall.sh`

Both currently remove:

- launchd state
- installed app files
- the local launcher
- the default config file
- the work directory

That behavior is unnecessarily destructive for the default uninstall path. The config file is operator-authored state, not disposable runtime state, and should be preserved unless the operator explicitly asks to remove it.

## Goals / Non-Goals

**Goals:**
- Preserve `~/.config/kfc/config.toml` by default for both CLI and shell uninstall flows.
- Keep full uninstall semantics aligned between `kfc uninstall` and `uninstall.sh`.
- Provide an explicit operator opt-in to delete the default config file.
- Make interactive and non-interactive behavior unambiguous in prompts and docs.

**Non-Goals:**
- Adding multiple config-selection modes or arbitrary config path deletion.
- Changing `kfc service uninstall`, which remains scoped to launchd-managed service and cronjob cleanup only.
- Preserving app files or work directory during full uninstall.

## Decisions

### Full uninstall preserves config by default

`kfc uninstall` and `uninstall.sh` will preserve the default config file at `~/.config/kfc/config.toml` unless the operator explicitly requests deletion.

The default full uninstall removes:
- launchd state
- installed app tree
- local launcher
- `~/.kfc`

It does **not** remove the default config file by default.

Alternative considered: keep current destructive behavior and add a new “preserve config” flag. Rejected because config preservation is the safer default and better matches operator expectations.

### Config deletion is an explicit opt-in

The CLI will support an explicit config-deletion option:

- `kfc uninstall --delete-config`
- `kfc uninstall --yes --delete-config`

The shell wrapper will expose the same behavior through an explicit environment opt-in:

- `KFC_DELETE_CONFIG=true ./uninstall.sh`

When `uninstall.sh` can delegate to the installed launcher, it should pass the equivalent CLI opt-in. When it falls back to shell cleanup, it should only delete the config file if the explicit environment opt-in is set.

Alternative considered: prompt inside `uninstall.sh`. Rejected because the script is commonly used in non-interactive contexts and already relies on non-interactive uninstall behavior.

### Operator-facing uninstall prompts must state config retention clearly

Interactive CLI confirmation must explicitly say that config is preserved by default unless `--delete-config` is present.

Examples:
- default: `This will remove the installed app, launcher, work directory, and launchd state. The default config will be preserved. Continue? [y/N]`
- destructive opt-in: `This will remove the installed app, launcher, work directory, launchd state, and the default config. Continue? [y/N]`

Non-interactive docs and summaries must likewise distinguish between:
- uninstall completed with config preserved
- uninstall completed with config deleted

### `uninstall.sh` and `kfc uninstall` must stay behaviorally aligned

The shell wrapper should continue to prefer `kfc uninstall --yes`, but its effective behavior must match the CLI in both modes:

- default: preserve config
- opt-in: delete config

This applies to both:
- the delegated launcher path
- the fallback shell cleanup path

Alternative considered: let `uninstall.sh` remain more destructive than the CLI. Rejected because the wrapper is part of the supported host lifecycle and should not surprise operators with different config handling.

## Risks / Trade-offs

- [Operators expecting the old “delete everything” behavior may leave config behind unintentionally] -> Make config preservation explicit in prompts, docs, and uninstall summaries, and require `--delete-config` or `KFC_DELETE_CONFIG=true` for destructive config removal.
- [CLI and shell wrapper semantics could drift again] -> Define both entrypoints against the same default and the same explicit opt-in model.

## Migration Plan

1. Update OpenSpec uninstall requirements to preserve config by default.
2. Adjust CLI uninstall parsing, confirmation text, and file-removal logic.
3. Adjust `uninstall.sh` delegated and fallback paths to preserve config by default.
4. Update tests and documentation to reflect the new default and opt-in destructive path.

## Open Questions

None for v1. The default config path remains `~/.config/kfc/config.toml`, and config deletion is controlled only by explicit uninstall options.
