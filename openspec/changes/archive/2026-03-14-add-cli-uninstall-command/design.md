## Context

The current uninstall behavior is split. `kfc service uninstall` removes launchd-managed service state and configured cronjob registrations, while `uninstall.sh` performs broader user-local cleanup such as removing the installed app tree, launcher, config file, and `~/.kfc` working directory. This means the primary CLI and the host-install uninstall path do not share a single core implementation.

## Goals / Non-Goals

**Goals:**
- Provide a top-level `kfc uninstall` command whose behavior matches the current full uninstall path.
- Add an interactive confirmation gate so destructive uninstall is not one keystroke away.
- Provide a non-interactive override so `uninstall.sh` can reuse the CLI implementation.
- Preserve the existing narrower meaning of `kfc service uninstall`.

**Non-Goals:**
- Changing the semantics of `kfc service uninstall`.
- Adding partial uninstall modes or per-path selective cleanup.
- Removing the shell installer/uninstaller entry points.

## Decisions

### Separate full uninstall from service lifecycle uninstall
`kfc uninstall` will be a top-level command, not a new `kfc service` subcommand. `kfc service uninstall` already has a clear meaning focused on launchd-managed service teardown, while full uninstall spans app files, config, work directories, and launchd state.

Alternative considered:
- Expand `kfc service uninstall` to also delete app/config/workdir. Rejected because it overloads service lifecycle semantics with full product removal.

### Default to interactive confirmation, with `--yes` for automation
`kfc uninstall` should print a removal summary and require `y` or `yes` before proceeding. `kfc uninstall --yes` should skip the prompt and execute immediately so `uninstall.sh` can delegate to it non-interactively.

Alternative considered:
- Make `kfc uninstall` always interactive with no override. Rejected because shell automation and `curl ... | sh` flows need a non-interactive path.

### Centralize destructive uninstall behavior in the CLI
The TypeScript CLI should own the uninstall implementation. `uninstall.sh` should become a thin wrapper that invokes `kfc uninstall --yes` when the installed launcher exists, keeping the shell script as a distribution entry point rather than a second full implementation.

Alternative considered:
- Keep independent uninstall logic in `uninstall.sh` and separately copy it into `kfc`. Rejected because duplicate destructive logic drifts easily.

### Treat user cancellation as a non-error exit
If the operator declines confirmation, `kfc uninstall` should abort cleanly without performing removal and return success rather than an operational error. Actual uninstall failures should still return a non-zero exit code.

Alternative considered:
- Return a failure exit code on cancellation. Rejected because deliberate refusal is not a runtime error.

## Risks / Trade-offs

- [Interactive prompt can block in unusual terminal environments] → Provide `--yes` for explicit non-interactive execution.
- [Centralizing uninstall in the CLI makes `uninstall.sh` depend on the installed launcher] → Keep a fallback branch in `uninstall.sh` for hosts where the launcher is already missing or broken.
- [Operators may confuse `kfc uninstall` with `kfc service uninstall`] → Document the distinction clearly: full user-local removal versus launchd/service-only cleanup.
