# Kids Alfred

Feishu-operated task runner for macOS hosts. One process can host multiple bot instances, each with its own Feishu credentials, task registry, SQLite run store, and cronjob state. The service executes only predefined tasks and supports both built-in tools and external command tasks.

## Quick Start

1. Install dependencies: `npm install`
2. Copy [`config/example.bot.toml`](config/example.bot.toml) to a local config file and fill in Feishu credentials.
3. Install and start the managed service with `./kfc service install --config /path/to/bot.toml`
4. For local development, run `KIDS_ALFRED_CONFIG=/path/to/bot.toml npm run dev` to watch `src/` and restart the service automatically on source changes.

Default local paths:
- Main config defaults to `~/.config/kfc/config.toml`
- Each bot defaults its working directory to `~/.kfc/`
- Each bot defaults its SQLite store to `~/.kfc/data/<botId>.sqlite`
- Relative `sqlite_path` values are resolved against that bot working directory
- `server.service_reconnect_notification_threshold_ms` controls the minimum outage window before `service_reconnected` is sent; the default is `600000` (`10` minutes)

## Host Install

For a fresh macOS host, install the project with:

```sh
curl -fsSL https://raw.githubusercontent.com/porcow/kfc/main/install.sh | sh
```

The installer:
- downloads the GitHub source tarball for `porcow/kfc`
- installs the app under `~/.local/share/kfc/app`
- runs `npm install --omit=dev`
- writes a user-local `kfc` launcher into `~/.local/bin/kfc`
- creates `~/.config/kfc/config.toml` from [`config/example.bot.toml`](config/example.bot.toml) if you do not already have one

Useful installer overrides:
- `KFC_REF`: branch or ref name to download, default `main`
- `KFC_GITHUB_REPO`: alternate GitHub repo slug, default `porcow/kfc`
- `KFC_INSTALL_DIR`: install root, default `~/.local/share/kfc`
- `KFC_BIN_DIR`: launcher directory, default `~/.local/bin`
- `KFC_CONFIG_PATH`: generated config path, default `~/.config/kfc/config.toml`

After the installer finishes, edit the generated config and then run:

```sh
~/.local/bin/kfc service install
```

If you keep the config anywhere other than `~/.config/kfc/config.toml`, use:

```sh
~/.local/bin/kfc service install --config /path/to/bot.toml
```

To completely uninstall the user-local installation later, run:

```sh
curl -fsSL https://raw.githubusercontent.com/porcow/kfc/main/uninstall.sh | sh
```

Or run the interactive CLI uninstall directly:

```sh
~/.local/bin/kfc uninstall
```

The uninstaller removes:
- `~/.local/share/kfc`
- `~/.local/bin/kfc`
- `~/.config/kfc/config.toml`
- `~/Library/LaunchAgents/com.kidsalfred.service.plist` after first attempting `kfc uninstall --yes`
- launchd registrations and plist files for configured cronjobs under the installed config or `~/.kfc/**/launchd/*.plist` as a fallback

## Runtime Model

- Feishu event subscriptions use one official SDK WebSocket client per configured bot.
- Interactive card callbacks and webhook fallback endpoints are exposed over one shared HTTP server using bot-scoped paths.
- Task definitions are loaded from TOML under `[bots.<id>]` using `runner_kind = "builtin-tool" | "external-command"` plus `execution_mode = "oneshot" | "cronjob"`, and only activate after startup or explicit reload.
- Run history is stored in a separate SQLite file per bot via the built-in `node:sqlite` module.
- Cronjob desired and observed state is stored separately from one-shot run history and reconciled against `launchd` on startup and reload.
- `/health` now reports both process liveness and per-bot WebSocket readiness. Use it to distinguish “process is up” from “bot is actually receiving Feishu events”.


## Feishu Interaction Flow

- Send `/help` to get a concise command reference for the bot text interface.
- Send `/health` to get an informational health summary for the running service, active bots, and per-bot WebSocket state.
- Send `/tasks` to get an informational catalog of one-shot tasks for the current bot.
- Bots only expose `/run sc` when they explicitly configure task `sc`; when enabled, it captures the current screen and returns the image to the same chat after confirmation.
- Bots only expose `/run update` when they explicitly configure task `update`; when enabled, it checks upstream git state, blocks unsafe repository states, and updates the deployment after confirmation.
- If your Feishu user is not yet authorized, the bot returns a one-time pairing card with a local admin command in the form `kfc pair BOT_ID-RAND6`.
- Each task card includes an example `/run TASK_ID key=value ...` command.
- Send `/run TASK_ID key=value ...` to validate parameters and get an explicit confirmation card for one-shot tasks.
- Send `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, or `/cron status` to manage cronjob tasks. `/cron start TASK_ID` subscribes the current chat and starts the task if needed. `/cron stop TASK_ID` stops the task globally and clears all subscriptions. `/run` rejects cronjob tasks and `/cron` rejects one-shot tasks.
- Click `Confirm` on the confirmation card to create the run, or `Cancel` to discard the pending request.
- A successful confirm returns an informational run card immediately in the `queued` state.
- The bot then pushes milestone run cards back to the originating chat when the run enters `running` and when it reaches a terminal state.
- Send `/run-status RUN_ID` at any time to look up a run directly.
- Send `/cancel RUN_ID` to request cancellation for a running task.
- `/help` stays task-agnostic; use `/tasks` when you need per-task examples and parameter hints.

## Local CLI

- [`kfc`](kfc) is the primary local admin entrypoint.
- `./kfc health` fetches the running service's configured loopback health endpoint and prints the canonical health snapshot.
- `./kfc update` checks the current git checkout against its upstream, prompts before applying a fast-forward update, runs installation, and refreshes the managed service.
- `./kfc update --yes` performs the same update workflow non-interactively once the repository safety checks pass.
- `./kfc service install` writes or refreshes `~/Library/LaunchAgents/com.kidsalfred.service.plist`, installs launchd management, and starts the main service immediately using `~/.config/kfc/config.toml`.
- `./kfc service install --config /path/to/bot.toml` does the same using an explicit override path.
- `./kfc service uninstall` stops the managed service if needed, unloads all configured bot-scoped cronjobs from launchd, removes their cron plist files, and then removes `~/Library/LaunchAgents/com.kidsalfred.service.plist`.
- `./kfc uninstall` performs a full user-local uninstall after interactive confirmation, removing launchd state, the installed app tree, launcher, default config, and `~/.kfc`.
- `./kfc uninstall --yes` performs the same full uninstall non-interactively and is intended for scripts such as `uninstall.sh`.
- `./kfc service start` starts an already-installed service.
- `./kfc service restart` restarts an already-installed service without changing cronjob policy.
- `./kfc service stop` stops an already-installed service without uninstalling it. Cronjobs still follow their configured `auto_start` policy the next time the service reconciles.
- `./kfc pair BOT_ID-RAND6` resolves a pending pairing request, updates `allowed_users`, and triggers immediate reload.
- `./kfc exec --bot BOT_ID --task TASK_ID` executes a configured task directly on the host using its config-defined parameters. This is also the command launchd uses for cronjobs.
- If the service is not installed, `./kfc service start`, `./kfc service restart`, and `./kfc service stop` return a clear operator-facing error instead of silently succeeding.

## WebSocket Operations

- Each bot keeps its own Feishu long connection and exposes bot-scoped WebSocket health through `/health`.
- Health output includes the bot's connection state, last successful connection time, next reconnect attempt when reconnecting, consecutive reconnect failures, and any warning about switching to the fallback webhook event endpoint.
- Exceeding the reconnect-failure threshold does not automatically switch Feishu subscription mode. The warning is operator guidance only.
- Process shutdown intentionally closes bot WebSocket clients and does not attempt replacement connections.
- Configuration reload intentionally retires old bot runtimes and explicitly starts replacement WebSocket clients for the new active bot set.

## Cronjob Management

- Cronjob tasks are defined with `execution_mode = "cronjob"` plus a `[...task.cron]` section containing `schedule` and `auto_start`.
- The service translates configured cron expressions into launchd plist definitions using stable labels in the form `com.kidsalfred.<bot_id>.<task_id>`.
- Cronjobs execute through `kfc exec --bot BOT_ID --task TASK_ID`, regardless of whether the task runner is `builtin-tool` or `external-command`.
- Monitoring-style built-in cronjobs such as `checkPDWin11` return structured notification intents; `kfc exec` resolves the correct `BOT_ID`, loads subscribed chats for that task, and fans out delivery through that bot's Feishu credentials.
- On startup and reload, the service reconciles each configured cronjob against launchd:
  - `auto_start = false` jobs are stopped if they are running.
  - `auto_start = true` jobs are restarted if already running, or started if absent.
- `/cron list` shows configured cronjob tasks with current-chat subscription state and runtime state, while `/cron status` shows the observed `running/stopped` state only.

## Run Result Contract

- Run cards always render the same canonical fields: `Run ID`, `Task`, `State`, `Actor`, `Started At`, `Finished At`, and `Summary`.
- All displayed time fields in Feishu cards use `YYYY/MM/DD HH:mm:ss`.
- `Summary` is a concise operator-facing excerpt derived from the persisted run record, not a raw stdout or stderr dump.
- Feishu summaries are truncated to 300 characters with an ellipsis when necessary.
- `/run sc` writes a temporary screenshot file under `~/.kfc/data/screenshot-YYYYMMDD-HHmmss.png`, uploads it back to the originating chat, and removes the file only after successful delivery.
- `/run update` reuses the same fast-forward-only inspection and execution workflow as `kfc update`; it reports `already latest`, `update completed`, or the specific blocking reason in the run summary.
- If an asynchronous push update fails, the run state remains persisted locally and can still be recovered with `/run-status RUN_ID`.

## Event Logging

- The service now emits structured inbound-event logs to stdout for supported Feishu message commands and card actions.
- Each log line is JSON with `logType: "feishu_inbound_event"` and includes at least `timestamp`, `botId`, `eventType`, `actorId`, `commandType`, and `decision`.
- When available, logs also include correlation identifiers such as `taskId`, `confirmationId`, and `runId`.
- Event logs intentionally exclude raw Feishu payloads, full task parameter maps, pairing codes, and stdout or stderr bodies.
- Feishu run-update delivery failures emit a separate JSON error log with `logType: "feishu_run_update_delivery_failed"` plus the affected `runId`, `taskId`, `state`, `chatId`, and error message.

## Pairing

- Pairing updates the target bot's `allowed_users` in TOML, then immediately calls the local reload endpoint at `/admin/reload`.
- Pairing codes use the format `BOT_ID-RAND6`, are one-time, and remain persisted in the target bot's SQLite store until used or expired.

## Verification

Run `npm test` to execute the local test suite.

The manual Feishu verification checklist is in [docs/manual-verification.md](docs/manual-verification.md).
