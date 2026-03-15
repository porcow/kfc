## Why

The current `checkPDWin11` design infers Windows 11 VM state from host process-list matching, which is brittle across Parallels Desktop versions and helper-process layouts. Switching to the vendor CLI `prlctl` gives the monitor a more stable observation source and creates a reusable boundary for future Parallels VM control tasks.

## What Changes

- Replace `checkPDWin11` VM state detection with `prlctl`-based inspection of the configured `Windows 11` VM.
- Introduce a reusable Parallels VM operations capability that encapsulates VM lookup, state inspection, and future `prlctl` command execution behind a controlled local boundary.
- Keep the existing `checkPDWin11` state machine and notification behavior, but change its observation source from host processes to Parallels CLI data.
- Define failure behavior for missing `prlctl`, unknown VMs, and unsupported CLI responses so monitoring remains diagnosable.

## Capabilities

### New Capabilities
- `parallels-vm-operations`: Provide a reusable host-local abstraction over `prlctl` for Parallels VM lookup, state inspection, and future VM operation tasks.

### Modified Capabilities
- `pd-win11-monitoring`: Change Windows 11 monitoring requirements from process-list inspection to `prlctl`-based VM inspection.

## Impact

- Affected code: `src/tools/checkPDWin11.ts`, new Parallels CLI abstraction modules, config/tests for monitoring.
- Affected systems: local macOS host dependency on Parallels Desktop CLI availability.
- Affected behavior: `checkPDWin11` becomes dependent on `prlctl` output rather than `ps` process matching.
