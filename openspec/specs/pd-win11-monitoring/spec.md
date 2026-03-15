## Purpose
Define the built-in Windows 11 Parallels monitor behavior, its persisted state model, and its notification policy.

## Requirements

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

### Requirement: The monitor keeps durable PDWin11 state across invocations
The system SHALL persist a bot-scoped, task-scoped monitor state for `checkPDWin11` with `PDWin11State=off|on`, the detected Windows 11 start time, and runtime-reminder timing metadata needed for later reminder calculations.

#### Scenario: First successful observation records an off state
- **WHEN** the tool runs successfully for a task that has no prior persisted monitor state and detects no matching Windows 11 VM process
- **THEN** the system persists the monitor state as `off`

#### Scenario: Running VM observation records an on state and start time
- **WHEN** the tool runs successfully and detects a matching Windows 11 VM process
- **THEN** the system persists the monitor state as `on`
- **AND** it persists the detected VM start time for that task

#### Scenario: Runtime reminder metadata survives restart
- **WHEN** the bot service or cronjob process restarts between monitoring invocations after at least one runtime reminder has been emitted
- **THEN** the next invocation reads the persisted runtime-reminder timing metadata before deciding whether another reminder is due

### Requirement: The monitor emits lifecycle notifications on state transitions
The system SHALL compare the current observation against the persisted `PDWin11State` and emit lifecycle notifications on `off -> on` and `on -> off` transitions.

#### Scenario: VM turns on
- **WHEN** the current observation finds a matching Windows 11 VM process and the persisted `PDWin11State` is `off`
- **THEN** the system updates the persisted state to `on`
- **AND** it persists the detected start time
- **AND** it emits a startup notification card with the title `MC 启动!`

#### Scenario: VM turns off
- **WHEN** the current observation finds no matching Windows 11 VM process and the persisted `PDWin11State` is `on`
- **THEN** the system updates the persisted state to `off`
- **AND** it clears or invalidates runtime-reminder timing metadata for that task
- **AND** it emits a shutdown notification card with the title `MC 下线!`

#### Scenario: VM remains off
- **WHEN** the current observation finds no matching Windows 11 VM process and the persisted `PDWin11State` is already `off`
- **THEN** the system does not emit a lifecycle notification
- **AND** it keeps the monitor in the `off` state

### Requirement: The monitor emits periodic runtime reminders while the VM remains on
The system SHALL continue evaluating current uptime during `on -> on` observations and SHALL emit runtime reminder notifications after the first hour of uptime and every 10 minutes thereafter while the VM remains `on`.

#### Scenario: Running VM has not yet reached one hour
- **WHEN** the current observation finds a matching Windows 11 VM process, the persisted `PDWin11State` is `on`, and the computed uptime is less than one hour
- **THEN** the system does not emit a runtime reminder

#### Scenario: Running VM first exceeds one hour
- **WHEN** the current observation finds a matching Windows 11 VM process, the persisted `PDWin11State` is `on`, and the computed uptime is at least one hour with no prior runtime reminder recorded for the current session
- **THEN** the system emits a runtime reminder notification card
- **AND** it records the runtime reminder send time durably
- **AND** the card title is `MC 已运行 <formatted duration>`

#### Scenario: Running VM exceeds one hour but reminder interval has not elapsed
- **WHEN** the current observation finds a matching Windows 11 VM process, the persisted `PDWin11State` is `on`, the computed uptime is at least one hour, and less than 10 minutes have elapsed since the last runtime reminder
- **THEN** the system does not emit another runtime reminder

#### Scenario: Running VM exceeds one hour and reminder interval has elapsed
- **WHEN** the current observation finds a matching Windows 11 VM process, the persisted `PDWin11State` is `on`, the computed uptime is at least one hour, and at least 10 minutes have elapsed since the last runtime reminder
- **THEN** the system emits another runtime reminder notification card
- **AND** it updates the persisted runtime reminder send time
- **AND** the card title is `MC 已运行 <formatted duration>`

### Requirement: Notification content includes readable lifecycle timing information
The system SHALL render `checkPDWin11` notification timestamps in the same canonical Feishu timestamp format `YYYY/MM/DD HH:mm:ss` using host-local time, and SHALL include human-readable runtime durations in the card body.

#### Scenario: Startup notification includes formatted start time and current runtime
- **WHEN** the tool emits a startup notification for an `off -> on` transition
- **THEN** the card body includes the detected Windows 11 start time in `YYYY/MM/DD HH:mm:ss`
- **AND** it includes the current runtime duration at the time of observation

#### Scenario: Shutdown notification includes formatted shutdown time and cumulative runtime
- **WHEN** the tool emits a shutdown notification for an `on -> off` transition
- **THEN** the card body includes the detected shutdown time in `YYYY/MM/DD HH:mm:ss`
- **AND** it includes the cumulative runtime duration from the persisted start time to the detected shutdown time

#### Scenario: Runtime reminder includes formatted start time and current runtime
- **WHEN** the tool emits a runtime reminder notification during an `on -> on` observation
- **THEN** the card body includes the Windows 11 start time in `YYYY/MM/DD HH:mm:ss`
- **AND** it includes the current runtime duration at the observation time
- **AND** it states that Windows 11 has been running longer than one hour
