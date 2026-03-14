## ADDED Requirements

### Requirement: The `sc` oneshot task captures the current screen and returns it through Feishu
The system SHALL support a predefined oneshot task `sc`, backed by the builtin-tool `screencapture`, that captures the current macOS screen, stores the image temporarily on disk, sends it back through the Feishu SDK to the originating chat, and removes the temporary file after successful delivery.

#### Scenario: Authorized `/run sc` request triggers the configured screencapture task
- **WHEN** an authorized Feishu user issues `/run sc` and confirms execution
- **THEN** the system resolves the predefined oneshot task `sc`
- **AND** it executes the underlying builtin-tool `screencapture` on the host machine

#### Scenario: Screenshot file is written to the default work data directory
- **WHEN** the `sc` task starts successfully
- **THEN** the system writes the captured image to `$HOME/.kfc/data/screenshot-{datetime}.png`
- **AND** the generated filename is unique enough for repeated operator use

#### Scenario: Screenshot is sent back to the originating chat
- **WHEN** the `sc` task completes image capture successfully
- **THEN** the system uploads the generated image through the Feishu SDK
- **AND** it sends the image message to the same chat that issued `/sc`

#### Scenario: Temporary screenshot file is deleted after successful delivery
- **WHEN** the screenshot image has been uploaded and sent successfully through Feishu
- **THEN** the system deletes the corresponding `$HOME/.kfc/data/screenshot-{datetime}.png` file

#### Scenario: Failed Feishu delivery retains the screenshot file
- **WHEN** the screenshot image is captured successfully but Feishu upload or send fails
- **THEN** the system leaves the generated screenshot file on disk
- **AND** it reports a clear failure rather than silently claiming success

#### Scenario: Screenshot capture failure does not attempt image delivery
- **WHEN** the host cannot capture the current screen successfully
- **THEN** the system fails the `sc` task
- **AND** it does not attempt to upload or send a screenshot image to Feishu
