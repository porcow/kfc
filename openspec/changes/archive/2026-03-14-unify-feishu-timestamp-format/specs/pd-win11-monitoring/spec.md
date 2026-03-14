## MODIFIED Requirements

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
