## Context

The service already has a canonical default config path at `~/.config/kfc/config.toml`, and host installation generates that file by default. However, `kfc service install` still requires `--config`, which makes the initial service setup more verbose than the rest of the CLI and creates an unnecessary mismatch between install-time and runtime path rules.

## Goals / Non-Goals

**Goals:**
- Let `kfc service install` succeed without `--config` by using the same default path as the rest of the service runtime.
- Preserve `--config /path/to/file` as an explicit override for non-default deployments.
- Keep operator-facing failures clear when neither an override nor the default file is available.

**Non-Goals:**
- Changing `kfc service start`, `restart`, or `stop` behavior.
- Introducing config discovery beyond the existing single default path.
- Changing install script output paths or bot-level default working directory rules.

## Decisions

### Use the existing runtime default path for `service install`
`kfc service install` will call the same default path resolver already used by runtime entrypoints when `--config` is omitted. This keeps one source of truth for the default config location and avoids a second install-only rule.

Alternative considered:
- Keep `install` strict and require `--config` forever. Rejected because it keeps the CLI inconsistent even though the default file is already well-defined and created by host install.

### Keep `--config` as a higher-priority override
If the operator provides `--config`, that path continues to win over the default path. This preserves current flexibility for local testing, alternate environments, and nonstandard deployments.

Alternative considered:
- Remove `--config` entirely and force the default file. Rejected because it would reduce flexibility for operators and automation.

### Fail fast when the resolved config file is missing
If `service install` is invoked without `--config` and `~/.config/kfc/config.toml` does not exist, the command will return a clear error telling the operator which path was expected. The command should not create an empty config implicitly because installation already has a separate host-install path for generating the example file.

Alternative considered:
- Auto-create a default config from the bundled example during `service install`. Rejected because it would make a service lifecycle command silently mutate operator config state.

## Risks / Trade-offs

- [Operators may rely on the old explicit-only behavior] → Keep `--config` fully supported and document the new default rather than removing the explicit form.
- [A missing default config could be mistaken for a service failure] → Return an error that names the exact expected path and indicates that `--config` can still override it.
- [Path resolution drift between CLI paths] → Reuse the existing default config resolver rather than reimplementing the path in the install command.
