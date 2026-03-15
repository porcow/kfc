## ADDED Requirements

### Requirement: The system provides a reusable Parallels VM operations boundary
The system SHALL provide a reusable host-local integration boundary for Parallels Desktop VMs backed by the `prlctl` CLI.

#### Scenario: VM inspection is requested by a builtin-tool
- **WHEN** a builtin-tool needs to inspect or operate on a Parallels Desktop VM
- **THEN** the system routes that request through the shared `prlctl` integration boundary
- **AND** it does not require the builtin-tool to parse raw `prlctl` output directly

### Requirement: The Parallels integration resolves VMs by configured display name
The system SHALL allow callers to identify a target Parallels VM by its configured display name and SHALL normalize the result into a reusable VM identity model.

#### Scenario: Named VM exists
- **WHEN** the integration resolves a VM by configured display name such as `Windows 11`
- **THEN** it returns a normalized VM identity and state object for that VM

#### Scenario: Named VM does not exist
- **WHEN** the integration resolves a VM by configured display name and no matching VM exists in Parallels Desktop
- **THEN** it returns a diagnosable failure
- **AND** callers can surface that failure without silently treating the VM as stopped

### Requirement: The Parallels integration normalizes VM runtime state
The system SHALL normalize `prlctl` inspection results into a stable runtime state model that callers can use without depending on raw CLI text.

#### Scenario: CLI reports a running VM
- **WHEN** `prlctl` reports that a target VM is running
- **THEN** the integration returns a normalized state indicating that the VM is on

#### Scenario: CLI reports a stopped VM
- **WHEN** `prlctl` reports that a target VM is stopped, suspended, or otherwise not actively running
- **THEN** the integration returns a normalized state indicating that the VM is not on

#### Scenario: CLI reports a transitional VM state
- **WHEN** `prlctl` reports that a target VM is in a transitional state such as starting, stopping, or resetting
- **THEN** the integration returns a clear failure rather than normalizing that state to on or off

#### Scenario: CLI reports an unknown VM state
- **WHEN** `prlctl` reports a VM state that the integration does not recognize
- **THEN** the integration returns a clear failure indicating that the VM state is unsupported

### Requirement: The Parallels integration fails clearly when `prlctl` is unavailable or unusable
The system SHALL treat missing or unusable `prlctl` execution as an explicit integration failure rather than inferring VM state indirectly.

#### Scenario: `prlctl` is missing from the host
- **WHEN** the integration attempts to run `prlctl` and the command is unavailable
- **THEN** it returns a clear failure indicating that the Parallels CLI is unavailable

#### Scenario: `prlctl` returns an unsupported response
- **WHEN** the integration receives CLI output that cannot be normalized into the required VM model
- **THEN** it returns a clear failure indicating that the Parallels CLI response could not be interpreted

### Requirement: The Parallels integration is extensible for future VM control tasks
The system SHALL expose the shared Parallels integration in a form that future builtin-tools can reuse for VM operations beyond monitoring.

#### Scenario: Future builtin-tool needs a Parallels VM action
- **WHEN** a future builtin-tool needs to start, stop, restart, suspend, or otherwise operate on a Parallels VM
- **THEN** it can reuse the shared Parallels integration boundary without re-implementing raw `prlctl` invocation and parsing
