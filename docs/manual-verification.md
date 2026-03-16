# Manual Verification

## Feishu Setup

1. Create or reuse a self-built Feishu app.
2. Repeat the app setup for each bot configured in the TOML file.
3. Enable event subscriptions for `im.message.receive_v1`.
4. Configure long-connection mode for event subscriptions.
5. Configure interactive card callback URLs such as `http://<host>:3000/bots/ops/webhook/card` and `http://<host>:3000/bots/support/webhook/card`.
6. Keep webhook fallback event URLs ready such as `http://<host>:3000/bots/ops/webhook/event`.

## Service Setup

1. Install dependencies with `bun install`.
2. Create a config file from `config/example.bot.toml`.
3. Install and start the service with `./kfc service install --config /path/to/bot.toml`.
4. Make the local admin wrapper executable with `chmod +x ./kfc`.
5. Confirm `/health` returns `200 OK` and lists the active bot IDs.
6. Confirm `/health` also reports per-bot WebSocket state and does not mark the service fully ready unless all active bots are connected.
7. Confirm the process stdout shows JSON event logs with `logType: "feishu_inbound_event"` when supported Feishu messages or card actions reach bot business logic.
8. Confirm `bun run dev`, `bun run start`, and `bun run test` all execute the repository-local workflow through Bun, and that direct `bun test` is supported for the full repository suite.
9. Confirm the installed `~/.local/bin/kfc` launcher executes through Bun, that generated main-service and cronjob plists use Bun program arguments, and that `install.sh` no longer requires Node.

## End-To-End Checks

1. Send `/help` from an allowed Feishu user and confirm the reply lists `/health`, `/tasks`, `/run TASK_ID key=value ...`, `/run-status RUN_ID`, `/cancel RUN_ID`, and `/reload`.
2. Confirm the `/help` reply does not duplicate the full task catalog and instead points the user to `/tasks`.
3. Send `/health` from an allowed Feishu user and confirm the reply summarizes service readiness, active bot IDs, and per-bot WebSocket state.
4. Confirm every human-facing timestamp shown in Feishu cards or replies uses `YYYY/MM/DD HH:mm:ss` rather than mixed ISO strings.
5. Send `/tasks` from an allowed Feishu user in bot A and confirm bot A's one-shot task list card arrives.
6. Send `/tasks` from an allowed Feishu user in bot B and confirm bot B's task list is different if configured differently.
7. For a bot that explicitly configures task `sc`, send `/run sc` from an allowed Feishu user and confirm:
   - the bot returns the normal confirmation card rather than using a dedicated `/sc` shortcut
   - confirming the request captures the current screen and sends the screenshot image back to the same chat
   - the temporary screenshot file under `~/.kfc/data/screenshot-YYYYMMDD-HHmmss.png` is deleted after successful image delivery
   - if Feishu image upload or send fails, the run surfaces a clear failure and the screenshot file remains on disk for debugging
8. For a bot that explicitly configures task `update`, send `/run update` and confirm:
   - the bot returns the normal one-shot confirmation card
   - if the latest stable GitHub Release matches the local install metadata, the confirmed run succeeds with an `already latest` style summary
   - if a newer stable release is available, the confirmed run stages the release under `app.new`, refreshes the managed service, and reports the new version in the terminal summary
   - if service refresh fails after swap but automatic rollback succeeds, the run fails with a summary that explicitly says the update failed and the service was restored to the previous version
   - if update and automatic rollback both fail, the run fails with a summary that explicitly says manual recovery is required
9. For a bot that explicitly configures task `rollback`, send `/run rollback` and confirm:
   - the bot returns the normal one-shot confirmation card
   - if `app.previous` and matching install metadata are present, the confirmed run swaps to the previous local version and reports the restored current version
   - if no rollback target exists, the run fails with `no rollback version is available`
   - if service refresh fails after swap, the run summary explicitly states whether automatic restoration succeeded or manual recovery is required
10. Trigger one `builtin-tool` task and confirm:
   - the task list card shows an example `/run ...` command
   - sending `/run ...` with invalid parameters returns validation feedback without creating a run
   - a confirmation card is shown after valid `/run ...` submission
   - the confirmation card exposes only `Confirm` and `Cancel`
   - the run starts only after confirmation
   - a `run_id` is returned in the immediate `queued` run card
   - the run card is informational only and includes `Run ID`, `Task`, `State`, `Actor`, `Started At`, `Finished At`, and `Summary`
   - the originating chat receives a follow-up `running` update and a terminal update
   - status lookup shows the same canonical card shape and the latest persisted state
11. Trigger one `external-command` task and confirm the same request and run-status flow works.
12. Click `Cancel` on a pending confirmation and confirm no run is created for that request.
13. Retry the same confirmation action and confirm no duplicate run is created.
14. Send `/cancel RUN_ID` for a cancellable running task and confirm it transitions to `cancelled`.
15. Edit the TOML file without reloading and confirm the active task list does not change.
16. Trigger reload and confirm the updated task list becomes visible across all valid bots.
17. Introduce an invalid bot config, trigger reload, and confirm the prior active bot map remains unchanged.
18. Stop the service during a running task, restart it, and confirm completed runs remain queryable and interrupted runs are marked failed.
19. Confirm each bot writes to its own SQLite file.
20. Use a task that returns or fails with a long message and confirm the Feishu `Summary` field is truncated rather than streaming the full output.
21. Simulate or induce a Feishu push-delivery failure, then confirm `/run-status RUN_ID` still returns the persisted terminal result.
22. Confirm a failed Feishu milestone push emits a JSON error log with `logType: "feishu_run_update_delivery_failed"` and the affected `runId`.
23. Send `/cron list` and confirm only cronjob tasks are listed.
24. Send `/cron start TASK_ID` for a cronjob task from chat A and confirm the current chat is shown as subscribed and the task reports running or already running without restart churn.
25. Send `/cron start TASK_ID` for the same task from chat B and confirm both chats can remain subscribed while runtime state stays running.
26. Send `/cron status` and confirm it returns the observed `running/stopped` state for the active bot without current-chat subscription details.
27. Send `/run TASK_ID ...` for a cronjob task and confirm the bot replies with a mode-mismatch message directing you to `/cron`.
28. Send `/cron start TASK_ID` for a one-shot task and confirm the bot replies with a mode-mismatch error.
29. Subscribe one or more chats to `checkPDWin11` with `/cron start check-pd-win11` and confirm:
   - `prlctl` is available on the host and can resolve the configured `Windows 11` VM by name
   - no notification is sent while the observed VM remains off
   - starting the Windows 11 Parallels VM causes exactly one startup notification card per subscribed chat
   - the startup card title is `MC 启动!`
   - the startup card includes Windows 11 start time and current runtime in `YYYY/MM/DD HH:mm:ss` / human-readable duration format
   - before one hour of uptime, subsequent polling while the VM remains on does not send duplicate notifications
   - once uptime first exceeds one hour, a runtime reminder card is sent with a title like `MC 已运行 1小时`
   - while the VM remains on after that threshold, additional runtime reminder cards are sent every 10 minutes rather than every poll
   - stopping the VM causes exactly one shutdown notification card per subscribed chat
   - the shutdown card title is `MC 下线!`
   - the shutdown card includes detected shutdown time and cumulative runtime in readable format
30. Send `/cron stop check-pd-win11` and confirm the task stops globally and clears all subscriptions so later transitions do not fan out until `/cron start` is issued again.
31. Restart the service after a startup notification but before shutdown, then stop the VM and confirm the persisted monitor state still allows the next polling run to emit the correct shutdown notification.

## Pairing Checks

1. Send `/help` or `/tasks` from an unauthorized Feishu user and confirm the reply includes `kfc pair BOT_ID-RAND6`.
2. Run the exact command locally on the bot host and confirm it exits successfully without restarting the service.
3. Retry `/help` or `/tasks` immediately from the same Feishu user and confirm the command reference or task catalog is now visible.
4. Re-run the same pairing command and confirm the tool reports the code as already used.
5. Let a pairing code expire, then run `kfc pair BOT_ID-RAND6` and confirm the tool rejects it without updating `allowed_users`.
6. In a multi-bot setup, confirm a code issued by bot A cannot authorize a user on bot B.
7. Confirm the emitted event logs do not include the plaintext pairing code.

## WebSocket Fallback Drill

1. Stop or block the WebSocket connection path.
2. Confirm `/health` reports the affected bot as `reconnecting` or `disconnected`, includes a reconnect counter, and surfaces a warning that references the bot's `/bots/<id>/webhook/event` fallback endpoint once the failure threshold is exceeded.
3. Switch the app's event subscription mode to webhook delivery.
4. Confirm the relevant `/bots/<id>/webhook/event` endpoint accepts the event challenge and `/tasks` still works for that bot.
5. Restore long-connection mode after the incident and confirm `/health` returns the bot to `connected` with the reconnect failure counter reset.

## Reload And Shutdown Checks

1. Install the service, confirm `/health` shows connected bots, and then trigger a config reload.
2. Confirm the old bot runtimes are retired and the replacement runtimes reconnect so `/health` returns the bots to `connected`.
3. Stop the service and confirm no replacement WebSocket connections are attempted during shutdown.
4. Start the installed service again and confirm cronjob reconciliation follows config policy:
   - `auto_start = false` jobs are stopped if launchd had them running
   - `auto_start = true` jobs are restarted if launchd had them running, or started otherwise

## Local CLI Checks

1. Run `./kfc exec --bot ops --task echo-tool` and confirm the task executes locally using its config-defined default parameters, or reports a validation error if the task requires parameters without defaults.
2. Run `./kfc health` and confirm it returns the same readiness and per-bot WebSocket state model as HTTP `/health`.
3. Run `./kfc update` on a release-based install that is already current and confirm it reports the current version without prompting for installation.
4. Run `./kfc update` when a newer latest stable release is available and confirm it prompts before staging the new release, refreshes the managed service after confirmation, and updates `~/.local/share/kfc/install-metadata.json`.
5. Force a service refresh failure after the new app has been activated and confirm `./kfc update` reports that the update failed and the install was rolled back to the previous version.
6. Run `./kfc rollback` when `app.previous` exists and confirm it prompts before swapping app directories and then reports the restored current version.
7. Run `./kfc rollback --yes` and confirm it skips confirmation but still blocks missing `app.previous` or unusable install metadata.
8. Confirm `~/Library/LaunchAgents/com.kidsalfred.service.plist` exists after `./kfc service install --config /path/to/bot.toml`.
9. Run `./kfc service restart` and confirm the managed main service restarts successfully.
10. Run `./kfc service stop` and confirm the managed main service stops without changing long-term cronjob policy.
11. While the plist is still installed, run `./kfc service start` and confirm the managed main service starts successfully.
12. Run `./kfc service uninstall` and confirm the managed main service is removed from launchd management, all configured bot-scoped cronjobs are unloaded from launchd, their cron plist files are deleted, and `~/Library/LaunchAgents/com.kidsalfred.service.plist` is deleted.
13. Reinstall a cronjob-enabled config, manually delete `~/Library/LaunchAgents/com.kidsalfred.service.plist` while leaving one or more bot cron plists under `~/.kfc/**/launchd/`, then run `./kfc service uninstall` and confirm the orphaned cronjobs are still unloaded from launchd and their plist files are deleted by fallback scanning.
14. After uninstall, run `./kfc service start`, `./kfc service restart`, and `./kfc service stop` separately and confirm each returns a clear "service is not installed" style error.
15. Reinstall the service if needed, then run `./kfc uninstall`, answer anything other than `y`/`yes`, and confirm no files are removed.
16. Run `./kfc uninstall --yes` and confirm the installed app tree, launcher, `~/.kfc`, main-service plist, and configured cronjob launchd state are removed while the default config is preserved.
17. Run `./kfc uninstall --yes --delete-config` and confirm the default config is removed as well.
18. Reinstall if needed, then run `KFC_DELETE_CONFIG=true ./uninstall.sh` and confirm the script deletes the default config only when explicitly opted in.

## Release Packaging Checks

1. Push or prepare a version tag such as `v0.2.0`, then confirm the GitHub Actions workflow [release-package.yml](/Users/porco/Projects/KidsAlfred/.github/workflows/release-package.yml) runs for that tag.
2. Confirm the workflow publishes a canonical tarball named `kfc-vX.Y.Z.tar.gz` to the matching GitHub Release.
3. Confirm the workflow also uploads the companion `kfc-vX.Y.Z.tar.gz.manifest.json`.
4. Download the tarball and confirm it contains:
   - `.kfc-release.json`
   - `src/index.ts`
   - `src/kfc.ts`
   - `package.json`
5. Extract or inspect `.kfc-release.json` from the tarball and confirm:
   - `repo` matches the GitHub repository slug
   - `version` matches the release tag
   - `channel` is `stable`
   - `asset_name` matches the tarball filename
6. Confirm a release-based install or `./kfc update` can consume that published tarball without any extra manual asset preparation.
