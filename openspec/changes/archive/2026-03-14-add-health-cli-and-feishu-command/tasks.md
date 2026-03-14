## 1. Shared health snapshot

- [x] 1.1 Extract the existing `/health` response assembly into a reusable health snapshot builder that returns the canonical bot health payload
- [x] 1.2 Keep the HTTP `/health` handler wired to that shared snapshot builder without changing the existing JSON contract

## 2. Local CLI access

- [x] 2.1 Add `kfc health` and have it resolve the configured port and `health_path`, query the running service over loopback, and print the returned health snapshot
- [x] 2.2 Return a clear operator-facing error when `kfc health` cannot reach the configured local health endpoint

## 3. Feishu command access

- [x] 3.1 Add authorized `/health` command parsing and service handling alongside the existing `/help`, `/tasks`, and `/cron` commands
- [x] 3.2 Add a Feishu health card/response renderer that summarizes overall readiness plus per-bot WebSocket state from the shared snapshot
- [x] 3.3 Ensure unauthorized `/health` requests follow the existing pairing/authorization flow and that `/help` includes `/health`

## 4. Verification and docs

- [x] 4.1 Add tests for the shared health snapshot, `kfc health`, authorized `/health`, and unauthorized `/health`
- [x] 4.2 Update README and manual verification guidance to document the new CLI and Feishu health entry points
