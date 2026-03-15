## MODIFIED Requirements

### Requirement: The system provides a built-in Parallels Windows 11 monitor tool
The system SHALL provide a built-in tool `checkPDWin11` that inspects the Parallels Desktop VM named `Windows 11` through the shared `prlctl`-backed Parallels integration rather than by scanning the macOS host process list.

#### Scenario: Windows 11 VM is reported as running by Parallels CLI
- **WHEN** the tool runs and the shared Parallels integration reports that the configured `Windows 11` VM is currently running
- **THEN** the tool treats the VM as currently running
- **AND** it uses the normalized Parallels inspection result for any timing metadata available to the monitor

#### Scenario: Windows 11 VM is reported as not running by Parallels CLI
- **WHEN** the tool runs and the shared Parallels integration reports that the configured `Windows 11` VM is not currently running
- **THEN** the tool treats the VM as currently off

#### Scenario: Parallels CLI inspection fails
- **WHEN** the tool cannot obtain a usable inspection result because `prlctl` is unavailable, the VM cannot be resolved, or the CLI response cannot be normalized
- **THEN** the tool fails that invocation
- **AND** it does not change the persisted monitor state
- **AND** it does not emit a lifecycle or runtime reminder notification
