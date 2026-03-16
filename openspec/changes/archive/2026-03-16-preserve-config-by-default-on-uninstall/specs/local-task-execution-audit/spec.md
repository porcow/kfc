## MODIFIED Requirements

### Requirement: The system SHALL provide a unified local CLI for service lifecycle, local uninstall, and local update flows

The system SHALL provide a unified local CLI named `kfc` for service lifecycle, pairing, controlled direct task execution, local health inspection, full user-local uninstall, and controlled self-update.

#### Scenario: Local admin performs a full uninstall through the CLI and preserves config by default
- **WHEN** a local administrator executes `kfc uninstall`
- **THEN** the system presents a destructive-action confirmation prompt before removing files
- **AND** the prompt clearly states that the default config file will be preserved unless config deletion was explicitly requested
- **AND** after confirmation it removes launchd state, installed app files, the local launcher, and the work directory
- **AND** it preserves the default config file at `~/.config/kfc/config.toml`

#### Scenario: Local admin opts in to deleting config during full uninstall
- **WHEN** a local administrator executes `kfc uninstall --delete-config`
- **THEN** the system presents a destructive-action confirmation prompt before removing files
- **AND** the prompt clearly states that the default config file will also be removed
- **AND** after confirmation it removes launchd state, installed app files, the local launcher, the work directory, and the default config file at `~/.config/kfc/config.toml`

#### Scenario: Local admin declines full uninstall confirmation
- **WHEN** a local administrator executes `kfc uninstall`
- **AND** responds with anything other than `y` or `yes`
- **THEN** the system aborts full uninstall without removing files or launchd state

#### Scenario: Non-interactive full uninstall preserves config by default
- **WHEN** a local administrator executes `kfc uninstall --yes`
- **THEN** the system skips the confirmation prompt
- **AND** it removes launchd state, installed app files, the local launcher, and the work directory
- **AND** it preserves the default config file at `~/.config/kfc/config.toml`

#### Scenario: Non-interactive full uninstall deletes config when explicitly requested
- **WHEN** a local administrator executes `kfc uninstall --yes --delete-config`
- **THEN** the system skips the confirmation prompt
- **AND** it removes launchd state, installed app files, the local launcher, the work directory, and the default config file at `~/.config/kfc/config.toml`

#### Scenario: Host uninstall flow preserves config by default
- **WHEN** an operator executes `uninstall.sh` without an explicit config-deletion opt-in
- **THEN** the uninstall flow removes launchd state, installed app files, the local launcher, and the work directory
- **AND** it preserves the default config file at `~/.config/kfc/config.toml`

#### Scenario: Host uninstall flow deletes config only when explicitly requested
- **WHEN** an operator executes `uninstall.sh` with `KFC_DELETE_CONFIG=true`
- **THEN** the uninstall flow removes launchd state, installed app files, the local launcher, the work directory, and the default config file at `~/.config/kfc/config.toml`
