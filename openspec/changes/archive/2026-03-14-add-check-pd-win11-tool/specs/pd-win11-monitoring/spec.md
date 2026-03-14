## ADDED Requirements

### Requirement: The system provides a built-in Parallels Windows 11 monitor tool
The system SHALL provide a built-in tool `checkPDWin11` that inspects the macOS host process list for a Parallels Desktop Windows 11 VM instance.

#### Scenario: Matching Windows 11 VM process is present
- **WHEN** the tool runs and finds at least one process-list entry that matches the configured Parallels Windows 11 VM detection rule
- **THEN** the tool treats the VM as currently running
- **AND** it selects a parseable process start time for that observation

#### Scenario: No matching Windows 11 VM process is present
- **WHEN** the tool runs and finds no process-list entries that match the configured Parallels Windows 11 VM detection rule
- **THEN** the tool treats the VM as currently off

#### Scenario: Start time cannot be parsed from a matching process
- **WHEN** the tool finds a matching process entry but cannot parse a valid start time from the selected observation
- **THEN** the tool fails that invocation
- **AND** it does not change the persisted monitor state
- **AND** it does not emit a lifecycle notification

### Requirement: The monitor keeps durable PDWin11 state across invocations
The system SHALL persist a bot-scoped, task-scoped monitor state for `checkPDWin11` with `PDWin11State=off|on` and the last detected Windows 11 start time needed for later runtime calculations.

#### Scenario: First successful observation records an off state
- **WHEN** the tool runs successfully for a task that has no prior persisted monitor state and detects no matching Windows 11 VM process
- **THEN** the system persists the monitor state as `off`

#### Scenario: Running VM observation records an on state and start time
- **WHEN** the tool runs successfully and detects a matching Windows 11 VM process
- **THEN** the system persists the monitor state as `on`
- **AND** it persists the detected VM start time for that task

#### Scenario: Persisted state survives restart
- **WHEN** the bot service or cronjob process restarts between monitoring invocations
- **THEN** the next invocation reads the previously persisted `PDWin11State` and stored start time before evaluating transitions

### Requirement: The monitor emits notifications only on lifecycle transitions
The system SHALL compare the current observation against the persisted `PDWin11State` and emit a Feishu notification only when the state changes between `off` and `on`.

#### Scenario: VM turns on
- **WHEN** the current observation finds a matching Windows 11 VM process and the persisted `PDWin11State` is `off`
- **THEN** the system updates the persisted state to `on`
- **AND** it persists the detected start time
- **AND** it emits a startup notification to the configured Feishu destination

#### Scenario: VM remains on
- **WHEN** the current observation finds a matching Windows 11 VM process and the persisted `PDWin11State` is already `on`
- **THEN** the system does not emit a lifecycle notification
- **AND** it keeps the monitor in the `on` state

#### Scenario: VM turns off
- **WHEN** the current observation finds no matching Windows 11 VM process and the persisted `PDWin11State` is `on`
- **THEN** the system updates the persisted state to `off`
- **AND** it emits a shutdown notification to the configured Feishu destination

#### Scenario: VM remains off
- **WHEN** the current observation finds no matching Windows 11 VM process and the persisted `PDWin11State` is already `off`
- **THEN** the system does not emit a lifecycle notification
- **AND** it keeps the monitor in the `off` state

### Requirement: Notification delivery is performed by the bot-scoped outer runner
The system SHALL keep `checkPDWin11` focused on observation and transition evaluation. When a lifecycle transition requires a Feishu notification, the tool SHALL return a structured notification intent and the bot-scoped outer execution layer SHALL perform the Feishu delivery using the `bot_id` from the `kfc exec --bot <bot_id> --task <task_id>` path.

#### Scenario: Cronjob execution resolves the correct bot for delivery
- **WHEN** a cronjob-managed `checkPDWin11` task is started from a bot's `/cron start TASK_ID` flow and later executes through `kfc exec --bot BOT_ID --task TASK_ID`
- **THEN** the outer execution layer resolves the configured task under that `BOT_ID`
- **AND** any resulting notification intent is delivered through that same bot's Feishu delivery context

#### Scenario: Built-in tool does not own Feishu client state directly
- **WHEN** `checkPDWin11` determines that a lifecycle transition notification is required
- **THEN** the tool returns structured notification data to the outer execution layer
- **AND** the tool does not instantiate or directly own a Feishu SDK client

### Requirement: Transition notifications include lifecycle timing information
The system SHALL include lifecycle timing details in the startup and shutdown notifications produced by `checkPDWin11`.

#### Scenario: Startup notification includes start time and current runtime
- **WHEN** the tool emits a startup notification for an `off -> on` transition
- **THEN** the notification includes the detected Windows 11 start time
- **AND** it includes the runtime duration from that start time to the current observation time

#### Scenario: Shutdown notification includes detected shutdown time and cumulative runtime
- **WHEN** the tool emits a shutdown notification for an `on -> off` transition
- **THEN** the notification includes the detected shutdown time, defined as the observation time when the VM is first found absent
- **AND** it includes the cumulative runtime duration from the persisted start time to that detected shutdown time

### Requirement: The monitor uses fixed task-local configuration
The system SHALL require `checkPDWin11` to use task-local fixed configuration rather than dynamic runtime parameters.

#### Scenario: Monitor task declares a notification destination
- **WHEN** a task is configured to use the `checkPDWin11` built-in tool
- **THEN** the task definition includes a fixed Feishu notification destination used for proactive lifecycle messages
- **AND** that destination is consumed by the outer execution layer when it delivers the tool's notification intent

#### Scenario: Monitor task omits a notification destination
- **WHEN** a task is configured to use the `checkPDWin11` built-in tool but does not declare a notification destination
- **THEN** the system rejects that task configuration as invalid

#### Scenario: Monitor task uses a default Windows 11 name match
- **WHEN** a task is configured to use the `checkPDWin11` built-in tool and does not override the VM display-name match value
- **THEN** the tool uses `Windows 11` as the default match target
