## MODIFIED Requirements

### Requirement: Bot WebSocket health and effective ingress availability are observable
The system SHALL expose bot-scoped ingress health so operators can distinguish process availability, primary WebSocket transport health, webhook fallback observations, and effective bot serviceability.

#### Scenario: Health endpoint reports strict WebSocket readiness
- **WHEN** the service ingress mode is `websocket-only`
- **THEN** the health or diagnostic surface reports a bot as ready only when its WebSocket transport is connected
- **AND** webhook observations do not make that bot ready under this mode

#### Scenario: Health endpoint reports degraded-but-available fallback state
- **WHEN** the service ingress mode is `websocket-with-webhook-fallback`
- **AND** a bot's WebSocket transport is reconnecting or disconnected
- **AND** recent webhook events have been observed for that bot inside the fallback recency window
- **THEN** the health or diagnostic surface reports that bot as available
- **AND** it marks the bot as degraded
- **AND** it identifies webhook as the active ingress transport for that bot

#### Scenario: Health endpoint reports unavailable bot when both ingress signals are absent
- **WHEN** the service ingress mode is `websocket-with-webhook-fallback`
- **AND** a bot's WebSocket transport is not connected
- **AND** no recent webhook events have been observed for that bot inside the fallback recency window
- **THEN** the health or diagnostic surface reports that bot as unavailable
- **AND** it does not treat stale webhook history as proof of current serviceability

#### Scenario: Health is available through HTTP, CLI, and Feishu command surfaces
- **WHEN** the running service publishes health data
- **THEN** HTTP `/health`, `kfc health`, and the authorized Feishu `/health` command all expose the same canonical ingress mode and per-bot availability facts
- **AND** HTTP and CLI expose the full canonical JSON model
- **AND** Feishu exposes a summarized view derived from that same canonical model rather than a separate health implementation

#### Scenario: Reconnect notifications use the same effective availability standard as health
- **WHEN** the service evaluates whether a bot has recovered after a prolonged absence of successful ingress checks
- **THEN** it uses the same ingress-mode-aware `ingressAvailable` predicate that drives health readiness and bot availability
- **AND** it does not maintain a second reconnect-only health definition that can disagree with the canonical health model

#### Scenario: Webhook fallback observations remain visible for diagnostics
- **WHEN** the service observes webhook-delivered Feishu events for a bot
- **THEN** it records the latest webhook event timestamp and type for that bot
- **AND** the canonical health output exposes those observations so operators can correlate fallback activity with transport degradation
