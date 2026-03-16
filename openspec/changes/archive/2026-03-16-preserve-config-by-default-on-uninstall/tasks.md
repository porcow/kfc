## 1. CLI Uninstall Semantics

- [x] 1.1 Add a `--delete-config` option to `kfc uninstall`.
- [x] 1.2 Preserve the default config file by default in the full uninstall path.
- [x] 1.3 Update interactive confirmation text to distinguish config-preserving and config-deleting uninstall modes.
- [x] 1.4 Keep `--yes` semantics unchanged except for the new default config preservation behavior.

## 2. Shell Uninstall Wrapper

- [x] 2.1 Change `uninstall.sh` so the default path preserves the default config file.
- [x] 2.2 Add an explicit `KFC_DELETE_CONFIG=true` opt-in for config deletion.
- [x] 2.3 Ensure the delegated launcher path and fallback shell-cleanup path behave the same with respect to config preservation/deletion.

## 3. Verification and Docs

- [x] 3.1 Update uninstall-related tests for both preserve-config and delete-config paths.
- [x] 3.2 Update README uninstall guidance to describe the new default and explicit deletion options.
- [x] 3.3 Update manual verification steps for both CLI and shell uninstall behavior.
- [x] 3.4 Validate the OpenSpec change.
