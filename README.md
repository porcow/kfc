# Kids Alfred

Feishu-operated task runner for macOS hosts. One process can host multiple bot instances, each with its own Feishu credentials, task registry, SQLite run store, and cronjob state. The service executes only predefined tasks and supports both built-in tools and external command tasks.

## Quick Start

1. Install dependencies: `bun install`
2. Copy [`config/example.bot.toml`](config/example.bot.toml) to a local config file and fill in Feishu credentials.
3. Install and start the managed service with `./kfc service install --config /path/to/bot.toml`
4. For local development, run `KIDS_ALFRED_CONFIG=/path/to/bot.toml bun run dev` to watch `src/` and restart the service automatically on source changes.

Dependency installation uses Bun. Repository-local `start`, `dev`, and `test` run on Bun, and the installed service and launcher now run on Bun as well.

Default local paths:
- Main config defaults to `~/.config/kfc/config.toml`
- Each bot defaults its working directory to `~/.kfc/`
- Each bot defaults its SQLite store to `~/.kfc/data/<botId>.sqlite`
- Relative `sqlite_path` values are resolved against that bot working directory
- `server.service_reconnect_notification_threshold_ms` controls the minimum successful-heartbeat gap before `service_reconnected` is sent; the default is `3600000` (`1` hour)

## Host Install

For a fresh macOS host, install the project with:

```sh
curl -fsSL https://raw.githubusercontent.com/porcow/kfc/main/install.sh | sh
```

The installer:
- downloads the latest stable GitHub Release tarball for `porcow/kfc`
- installs the app under `~/.local/share/kfc/app`
- installs Bun if needed and runs `bun install --production`
- writes a user-local `kfc` launcher into `~/.local/bin/kfc`
- records local install state in `~/.local/share/kfc/install-metadata.json`
- creates `~/.config/kfc/config.toml` from [`config/example.bot.toml`](config/example.bot.toml) if you do not already have one

The package manager for install is Bun. The installed launcher and managed service also run on Bun.

## Release Packaging

Tagged releases are packaged by GitHub Actions rather than ad hoc archive downloads.

- Push a version tag such as `v0.2.0`.
- The workflow at [release-package.yml](/Users/porco/Projects/KidsAlfred/.github/workflows/release-package.yml) stages the runtime app root, generates `.kfc-release.json`, and produces the canonical asset `kfc-vX.Y.Z.tar.gz`.
- The workflow uploads both the tarball and a companion manifest JSON to the matching GitHub Release.
- `install.sh` and the release-based `kfc update` / `/server update` flows consume that workflow-produced GitHub Release tarball.

The packaged tarball embeds `.kfc-release.json` with:
- `repo`
- `version`
- `channel`
- `published_at`
- `asset_name`

The packaging step verifies that the tarball contains:
- `.kfc-release.json`
- `src/index.ts`
- `src/kfc.ts`
- `package.json`

The embedded `asset_name` must match the uploaded tarball filename, or the workflow fails before publishing.

Useful installer overrides:
- `KFC_GITHUB_REPO`: alternate GitHub repo slug, default `porcow/kfc`
- `KFC_RELEASE_API_URL`: alternate GitHub Releases API endpoint, default `https://api.github.com/repos/<repo>/releases/latest`
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
- `~/Library/LaunchAgents/com.kidsalfred.service.plist` after first attempting `kfc uninstall --yes`
- launchd registrations and plist files for configured cronjobs under the installed config or `~/.kfc/**/launchd/*.plist` as a fallback

By default it preserves `~/.config/kfc/config.toml`. To remove the default config too:

```sh
KFC_DELETE_CONFIG=true curl -fsSL https://raw.githubusercontent.com/porcow/kfc/main/uninstall.sh | sh
```

## Runtime Model

- Feishu event subscriptions use one official SDK WebSocket client per configured bot.
- Feishu interaction is handled through one official SDK WebSocket client per configured bot.
- Task definitions are loaded from TOML under `[bots.<id>]` using `runner_kind = "builtin-tool" | "external-command"` plus `execution_mode = "oneshot" | "cronjob"`, and only activate after startup or explicit reload.
- Run history is stored in a separate SQLite file per bot via Bun's built-in sqlite support.
- Cronjob desired and observed state is stored separately from one-shot run history and reconciled against `launchd` on startup and reload.
- `/health` now reports process liveness, per-bot WebSocket transport health, recent WebSocket ingress observations, and effective bot availability.


## Feishu Interaction Flow

- Send `/help` to get a concise command reference for the bot text interface.
- Send `/server health` to get an informational health summary for the running service, active bots, ingress mode, and per-bot ingress availability.
- Send `/server version` to get the current running or installed version.
- Send `/tasks` to get an informational catalog of one-shot tasks for the current bot.
- Bots only expose `/run sc` when they explicitly configure task `sc`; when enabled, it captures the current screen and returns the image to the same chat after confirmation.
- Bots only expose `/shell {script}` when they explicitly configure task `shell`; when enabled, it submits the inline shell body as a high-privilege one-shot run after confirmation.
- Bots only expose `/osascript {script}` when they explicitly configure task `osascript`; when enabled, it submits the inline AppleScript body as a high-privilege one-shot run after confirmation.
- Bots only expose `/server update` when they explicitly configure task `update`; when enabled, it checks the latest stable GitHub Release and hands the refresh phase off to a detached one-shot helper so the running service can be safely replaced without killing the update executor.
- Bots only expose `/server rollback` when they explicitly configure task `rollback`; when enabled, it hands the rollback refresh phase off to the same detached helper model instead of letting the active service process replace itself in-place.
- If your Feishu user is not yet authorized, the bot returns a one-time pairing card with a local admin command in the form `kfc pair BOT_ID-RAND6`.
- Each task card includes an example `/run TASK_ID key=value ...` command.
- Send `/run TASK_ID key=value ...` to validate parameters and get an explicit confirmation card for one-shot tasks.
- Send `/cron list`, `/cron start TASK_ID`, `/cron stop TASK_ID`, or `/cron status` to manage cronjob tasks. `/cron start TASK_ID` subscribes the current chat and starts the task if needed. `/cron stop TASK_ID` stops the task globally and clears all subscriptions. `/run` rejects cronjob tasks and `/cron` rejects one-shot tasks.
- Click `Confirm` on the confirmation card to create the run, or `Cancel` to discard the pending request.
- A successful confirm returns an informational run card immediately in the `queued` state.
- The bot then pushes milestone run cards back to the originating chat when the run enters `running`; update and rollback terminal cards may arrive after service restart because their final status is reconciled from durable state.
- Send `/run-status RUN_ID` at any time to look up a run directly.
- Send `/cancel RUN_ID` to request cancellation for a running task.
- `/help` stays task-agnostic; use `/tasks` when you need per-task examples and parameter hints.

## Local CLI

- [`kfc`](kfc) is the primary local admin entrypoint.
- `./kfc health` fetches the running service's configured loopback health endpoint and prints the canonical health snapshot.
- `./kfc version` prints the current running or installed version label.
- `./kfc update` checks the latest stable GitHub Release against the locally installed release metadata, persists a restart-safe handoff record, and schedules a detached one-shot helper to perform the managed-service refresh.
- `./kfc update --yes` performs the same release-based update workflow non-interactively once install metadata and the latest stable release are usable.
- `./kfc rollback` checks whether `app.previous` and matching install metadata are available, then schedules the same detached helper pattern to perform the rollback refresh safely across service replacement.
- `./kfc rollback --yes` performs the same rollback workflow non-interactively.
- `./kfc service install` writes or refreshes `~/Library/LaunchAgents/com.kidsalfred.service.plist`, removes cron launchd jobs deleted from the previously installed config, and starts the main service immediately using `~/.config/kfc/config.toml`.
- `./kfc service install --config /path/to/bot.toml` does the same using an explicit override path.
- `./kfc service uninstall` stops the managed service if needed, unloads all configured bot-scoped cronjobs from launchd, removes their cron plist files, and then removes `~/Library/LaunchAgents/com.kidsalfred.service.plist`.
- `./kfc uninstall` performs a full user-local uninstall after interactive confirmation, removing launchd state, the installed app tree, launcher, and `~/.kfc` while preserving the default config.
- `./kfc uninstall --yes` performs the same full uninstall non-interactively and is intended for scripts such as `uninstall.sh`.
- `./kfc uninstall --delete-config` or `./kfc uninstall --yes --delete-config` also removes `~/.config/kfc/config.toml`.
- `./kfc service start` starts an already-installed service.
- `./kfc service restart` restarts an already-installed service without changing cronjob policy.
- `./kfc service stop` stops an already-installed service without uninstalling it. It does not remove the main-service plist or cron launchd plists, and cronjobs still follow their configured `auto_start` policy the next time the service reconciles.
- `./kfc pair BOT_ID-RAND6` resolves a pending pairing request, updates `allowed_users`, and triggers immediate reload.
- `./kfc exec --bot BOT_ID --task TASK_ID` executes a configured task directly on the host using its config-defined parameters. This is also the command launchd uses for cronjobs.
- If the service is not installed, `./kfc service start`, `./kfc service restart`, and `./kfc service stop` return a clear operator-facing error instead of silently succeeding.

## WebSocket Operations

- Each bot keeps its own Feishu long connection and exposes bot-scoped WebSocket transport and ingress observations through `/server health`.
- `system_sleeping` is a best-effort power notification emitted when macOS sleep is observed while the process still has time to attempt a Feishu send.
- `system_woke` is emitted after macOS wake is observed and effective WebSocket availability has recovered enough to deliver the Feishu notification.
- Allowlisted users are auto-subscribed to `system_sleeping` and `system_woke` by default.
- `service_online` is still emitted only once per bot runtime, when that bot first reaches `connected` after the main service process starts.
- `service_reconnected` is still emitted from the same availability-aware reconnect evaluator used by the periodic heartbeat path, not directly from reconnect/disconnect state churn, but it is now treated as an optional diagnostic subscription rather than a default operator alert.
- The service establishes a startup heartbeat baseline as soon as a bot becomes available and then keeps a once-per-minute periodic heartbeat as a safety net.
- When effective WebSocket availability transitions from unavailable to available, the service immediately re-runs reconnect evaluation instead of waiting only for the next 60-second heartbeat tick.
- A successful availability check can come from either a connected WebSocket transport or a recent WebSocket-delivered ingress observation for that bot.
- Health output includes the bot's WebSocket transport state, recent WebSocket ingress observations, active ingress transport, and effective availability.
- Exceeding the reconnect-failure threshold does not automatically switch Feishu subscription mode. The warning is operator guidance only.
- Process shutdown intentionally closes bot WebSocket clients and does not attempt replacement connections.
- Configuration reload intentionally retires old bot runtimes and explicitly starts replacement WebSocket clients for the new active bot set.

## Cronjob Management

- Cronjob tasks are defined with `execution_mode = "cronjob"` plus a `[...task.cron]` section containing `schedule` and `auto_start`.
- The service translates configured cron expressions into launchd plist definitions using stable labels in the form `com.kidsalfred.<bot_id>.<task_id>`.
- Cronjobs execute through `kfc exec --bot BOT_ID --task TASK_ID`, regardless of whether the task runner is `builtin-tool` or `external-command`.
- Monitoring-style built-in cronjobs such as `checkPDWin11` return structured notification intents; `kfc exec` resolves the correct `BOT_ID`, loads subscribed chats for that task, and fans out delivery through that bot's Feishu credentials.
- `checkPDWin11` uses Parallels Desktop's `prlctl` CLI as its source of truth for `Windows 11` VM state, rather than matching helper processes from the host process list.
- On startup and reload, the service reconciles each configured cronjob against launchd:
  - `auto_start = false` jobs are stopped if they are running.
  - `auto_start = true` jobs are restarted if already running, or started if absent.
- `/cron list` shows configured cronjob tasks with current-chat subscription state and runtime state, while `/cron status` shows the observed `running/stopped` state only.

## Run Result Contract

- Run cards always render the same canonical fields: `Run ID`, `Task`, `State`, `Actor`, `Started At`, `Finished At`, and `Summary`.
- All displayed time fields in Feishu cards use `YYYY/MM/DD HH:mm:ss`.
- `Summary` is a concise operator-facing excerpt derived from the persisted run record, not a raw stdout or stderr dump.
- Feishu summaries are truncated to 300 characters with an ellipsis when necessary.
- `/shell` and `/osascript` materialize the submitted script body into a temporary local file before execution, and still use the same run persistence and `/run-status` lookup contract as other one-shot tasks.
- `/run sc` writes a temporary screenshot file under `~/.kfc/data/screenshot-YYYYMMDD-HHmmss.png`, uploads it back to the originating chat, and removes the file only after successful delivery.
- `/server update` reuses the same release-based inspect/prepare/handoff workflow as `kfc update`; the final run summary is recovered after restart from the detached helper operation state and reports `already latest`, `update completed`, `update failed and rolled back`, or explicit blocking/recovery errors.
- `/server rollback` reuses the same rollback inspect/prepare/handoff workflow as `kfc rollback`; the final run summary is likewise recovered from durable helper state after service replacement.
- If an asynchronous push update fails, the run state remains persisted locally and can still be recovered with `/run-status RUN_ID`.
- If self-update or self-rollback fails after crossing the refresh boundary, the helper first attempts to restore the previous known-good version before settling terminal state. `manual recovery required` is reserved for cases where both the attempted refresh and the automatic restoration path fail.

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

Run `npm test`, `bun run test`, or `bun test` to execute the local test suite. Bun is now the supported repository test runner.

The manual Feishu verification checklist is in [docs/manual-verification.md](docs/manual-verification.md).
