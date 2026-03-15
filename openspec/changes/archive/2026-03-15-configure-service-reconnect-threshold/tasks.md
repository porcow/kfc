## 1. Config

- [x] 1.1 Extend global server config with `service_reconnect_notification_threshold_ms`, defaulting to `600000`
- [x] 1.2 Add or update config parsing tests to cover the default and explicit override values

## 2. Reconnect Notification Logic

- [x] 2.1 Replace the hard-coded reconnect threshold with the global service config value
- [x] 2.2 Add or update tests to verify short outages stay silent below the configured threshold and notify at/above it

## 3. Samples And Docs

- [x] 3.1 Update `config/example.bot.toml` to include the new global config item with a comment that the unit is `ms`
- [x] 3.2 Update any relevant docs that currently describe the reconnect threshold as a fixed 5-minute rule

## 4. Verification

- [x] 4.1 Run the relevant config, sdk, and service-related test suites
- [x] 4.2 Validate the OpenSpec change and confirm the task checklist is complete
