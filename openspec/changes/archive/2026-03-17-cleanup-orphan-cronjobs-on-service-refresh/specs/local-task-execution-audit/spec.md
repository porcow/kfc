## ADDED Requirements

### Requirement: Service refresh converges cron launchd state to the active config
The system SHALL make `kfc service install`-based refresh converge KFC-managed cron launchd state to the active config, including removing cron launchd jobs that belonged to the previously installed config but are no longer declared.

#### Scenario: Service install removes cron jobs deleted from config
- **WHEN** a local administrator executes `kfc service install` for a config that no longer declares one or more cron tasks present under the previously installed service config
- **THEN** the system unloads those deleted cron launchd jobs and removes their cron plist files before starting the refreshed main service
- **AND** it keeps cron jobs that are still declared available for the normal post-start reconcile flow

#### Scenario: Release update refresh cleans deleted cron jobs
- **WHEN** `kfc update` completes activation of a new release
- **THEN** the service refresh step removes cron launchd jobs deleted from the active config in addition to refreshing the main service plist
- **AND** the host launchd state after the refresh matches the currently active config rather than retaining deleted cron jobs

#### Scenario: Release rollback refresh cleans deleted cron jobs
- **WHEN** `kfc rollback` completes activation of the rollback target
- **THEN** the service refresh step removes cron launchd jobs deleted from the active config in addition to refreshing the main service plist
- **AND** the host launchd state after the refresh matches the currently active config rather than retaining deleted cron jobs

#### Scenario: Service stop keeps launchd configuration intact
- **WHEN** a local administrator executes `kfc service stop`
- **THEN** the system stops only the main service process
- **AND** it does not delete the main service plist, unload configured cron launchd jobs, or remove cron plist files
