## Why

`kfc service install` currently requires an explicit `--config` argument even though the service already has a well-defined default configuration path at `~/.config/kfc/config.toml`. This makes the install flow inconsistent with the rest of the CLI and adds unnecessary friction for the default host-install path.

## What Changes

- Allow `kfc service install` to omit `--config` and fall back to `~/.config/kfc/config.toml`.
- Keep `--config /path/to/file` as an override for non-default installs.
- Update operator-facing help, install guidance, and error handling to reflect that `install` can succeed without an explicit config path when the default file exists.
- Return a clear error when `kfc service install` is invoked without `--config` and the default config file is missing.

## Capabilities

### New Capabilities

### Modified Capabilities
- `local-task-execution-audit`: change the `kfc service install` requirement so the config path becomes optional and defaults to `~/.config/kfc/config.toml`

## Impact

- Affected code: `src/kfc.ts`, default config path handling, install/uninstall documentation, and CLI tests
- Affected systems: local operator CLI and host install flow
