## 1. Proposal And Interface

- [x] 1.1 Add a shared Parallels CLI abstraction for VM lookup, inspection, and future command execution primitives.
- [x] 1.2 Define the normalized VM identity and runtime-state model that builtin-tools will consume instead of raw `prlctl` text.

## 2. `checkPDWin11` Migration

- [x] 2.1 Replace the current process-list-based `checkPDWin11` observation path with the shared `prlctl`-backed Parallels integration.
- [x] 2.2 Preserve the existing monitor state machine and notification behavior while changing only the VM observation source.
- [x] 2.3 Add explicit operator-facing failures for missing `prlctl`, unresolved VMs, and unsupported CLI output.

## 3. Verification

- [x] 3.1 Update unit tests to cover normalized Parallels VM state parsing and `checkPDWin11` behavior under `prlctl` success and failure cases.
- [x] 3.2 Update example configuration and operator documentation to describe `prlctl` as the source of truth for Parallels VM monitoring and future VM operation tasks.
