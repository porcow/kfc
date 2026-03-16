## Why

The current full uninstall behavior always deletes the default local config file at `~/.config/kfc/config.toml`. That is overly destructive for the common case where an operator wants to remove the installed app, launchd state, and work directory but keep the bot configuration for later reinstall or migration.

The CLI and shell wrapper should converge on a safer default: preserve the config unless the operator explicitly opts in to deleting it.

## What Changes

- Change `kfc uninstall` so it preserves the default config file by default.
- Add an explicit opt-in to remove the default config file during full uninstall.
- Change `uninstall.sh` to match the same default behavior and explicit opt-in.
- Update operator-facing prompts and documentation so it is clear whether config is preserved or deleted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: full uninstall semantics change so the default uninstall flow preserves the default config file unless the operator explicitly requests config deletion.

## Impact

- Affected code: [src/kfc.ts](/Users/porco/Projects/KidsAlfred/src/kfc.ts), [uninstall.sh](/Users/porco/Projects/KidsAlfred/uninstall.sh), uninstall-related tests, and docs.
- Affected systems: local CLI uninstall, shell-based uninstall, and operator documentation.
- Breaking behavior: full uninstall no longer deletes the default config file by default.
