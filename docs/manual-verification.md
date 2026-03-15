# Manual Verification

## Feishu Setup

1. Create or reuse a self-built Feishu app.
2. Repeat the app setup for each bot configured in the TOML file.
3. Enable event subscriptions for `im.message.receive_v1`.
4. Configure long-connection mode for event subscriptions.
5. Configure interactive card callback URLs such as `http://<host>:3000/bots/ops/webhook/card` and `http://<host>:3000/bots/support/webhook/card`.
6. Keep webhook fallback event URLs ready such as `http://<host>:3000/bots/ops/webhook/event`.

## Service Setup

1. Install dependencies with `npm install`.
2. Create a config file from `config/example.bot.toml`.
3. Install and start the service with `./kfc service install --config /path/to/bot.toml`.
4. Make the local admin wrapper executable with `chmod +x ./kfc`.
5. Confirm `/health` returns `200 OK` and lists the active bot IDs.
6. Confirm `/health` also reports per-bot WebSocket state and does not mark the service fully ready unless all active bots are connected.
7. Confirm the process stdout shows JSON event logs with `logType: "feishu_inbound_event"` when supported Feishu messages or card actions reach bot business logic.

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
   - if the checkout is already current, the confirmed run succeeds with an `already latest` style summary
   - if a fast-forward update is available, the confirmed run updates the checkout, refreshes the managed service, and reports the new version in the terminal summary
   - dirty, ahead, diverged, missing-upstream, or fetch-failed repository states produce a clear failed run summary instead of attempting installation
9. Trigger one `builtin-tool` task and confirm:
   - the task list card shows an example `/run ...` command
   - sending `/run ...` with invalid parameters returns validation feedback without creating a run
   - a confirmation card is shown after valid `/run ...` submission
   - the confirmation card exposes only `Confirm` and `Cancel`
   - the run starts only after confirmation
   - a `run_id` is returned in the immediate `queued` run card
   - the run card is informational only and includes `Run ID`, `Task`, `State`, `Actor`, `Started At`, `Finished At`, and `Summary`
   - the originating chat receives a follow-up `running` update and a terminal update
   - status lookup shows the same canonical card shape and the latest persisted state
10. Trigger one `external-command` task and confirm the same request and run-status flow works.
11. Click `Cancel` on a pending confirmation and confirm no run is created for that request.
12. Retry the same confirmation action and confirm no duplicate run is created.
13. Send `/cancel RUN_ID` for a cancellable running task and confirm it transitions to `cancelled`.
14. Edit the TOML file without reloading and confirm the active task list does not change.
15. Trigger reload and confirm the updated task list becomes visible across all valid bots.
16. Introduce an invalid bot config, trigger reload, and confirm the prior active bot map remains unchanged.
17. Stop the service during a running task, restart it, and confirm completed runs remain queryable and interrupted runs are marked failed.
18. Confirm each bot writes to its own SQLite file.
19. Use a task that returns or fails with a long message and confirm the Feishu `Summary` field is truncated rather than streaming the full output.
20. Simulate or induce a Feishu push-delivery failure, then confirm `/run-status RUN_ID` still returns the persisted terminal result.
21. Confirm a failed Feishu milestone push emits a JSON error log with `logType: "feishu_run_update_delivery_failed"` and the affected `runId`.
22. Send `/cron list` and confirm only cronjob tasks are listed.
23. Send `/cron start TASK_ID` for a cronjob task from chat A and confirm the current chat is shown as subscribed and the task reports running or already running without restart churn.
24. Send `/cron start TASK_ID` for the same task from chat B and confirm both chats can remain subscribed while runtime state stays running.
25. Send `/cron status` and confirm it returns the observed `running/stopped` state for the active bot without current-chat subscription details.
26. Send `/run TASK_ID ...` for a cronjob task and confirm the bot replies with a mode-mismatch message directing you to `/cron`.
27. Send `/cron start TASK_ID` for a one-shot task and confirm the bot replies with a mode-mismatch error.
28. Subscribe one or more chats to `checkPDWin11` with `/cron start check-pd-win11` and confirm:
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
29. Send `/cron stop check-pd-win11` and confirm the task stops globally and clears all subscriptions so later transitions do not fan out until `/cron start` is issued again.
30. Restart the service after a startup notification but before shutdown, then stop the VM and confirm the persisted monitor state still allows the next polling run to emit the correct shutdown notification.

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
3. Run `./kfc update` in an up-to-date checkout and confirm it reports the current version without prompting for installation.
4. Run `./kfc update` when a fast-forward update is available and confirm it prompts before applying the update and refreshes the managed service after confirmation.
5. Run `./kfc update --yes` and confirm it skips the local confirmation prompt but still blocks dirty, ahead, diverged, or missing-upstream repository states.
6. Confirm `~/Library/LaunchAgents/com.kidsalfred.service.plist` exists after `./kfc service install --config /path/to/bot.toml`.
7. Run `./kfc service restart` and confirm the managed main service restarts successfully.
8. Run `./kfc service stop` and confirm the managed main service stops without changing long-term cronjob policy.
9. While the plist is still installed, run `./kfc service start` and confirm the managed main service starts successfully.
10. Run `./kfc service uninstall` and confirm the managed main service is removed from launchd management, all configured bot-scoped cronjobs are unloaded from launchd, their cron plist files are deleted, and `~/Library/LaunchAgents/com.kidsalfred.service.plist` is deleted.
11. After uninstall, run `./kfc service start`, `./kfc service restart`, and `./kfc service stop` separately and confirm each returns a clear "service is not installed" style error.
12. Reinstall the service if needed, then run `./kfc uninstall`, answer anything other than `y`/`yes`, and confirm no files are removed.
13. Run `./kfc uninstall --yes` and confirm the installed app tree, launcher, default config, `~/.kfc`, main-service plist, and configured cronjob launchd state are all removed.
