## 1. CLI behavior

- [x] 1.1 Update `kfc service install` so omitted `--config` falls back to the shared default config path resolver
- [x] 1.2 Return a clear error when `kfc service install` omits `--config` and `~/.config/kfc/config.toml` does not exist

## 2. Verification and docs

- [x] 2.1 Add or update CLI tests for `kfc service install` with explicit config, implicit default config, and missing-default-config failure
- [x] 2.2 Update README and operator-facing install guidance to show that `kfc service install` can use the default config path without `--config`
