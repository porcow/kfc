## 1. Shared formatting

- [x] 1.1 Add a shared Feishu timestamp formatter that renders host-local time as `YYYY/MM/DD HH:mm:ss`
- [x] 1.2 Ensure the formatter is applied only at Feishu render time and does not change persisted ISO timestamps

## 2. Feishu rendering updates

- [x] 2.1 Update run status and milestone card rendering to use the shared timestamp formatter for all displayed time fields
- [x] 2.2 Update Feishu `/health` response rendering to use the shared timestamp formatter for any displayed time fields
- [x] 2.3 Update proactive monitoring notification rendering to use the shared timestamp formatter consistently

## 3. Verification and docs

- [x] 3.1 Add or update tests covering canonical `YYYY/MM/DD HH:mm:ss` output across Feishu command replies, run cards, and monitor notifications
- [x] 3.2 Update README and manual verification guidance to state that all Feishu-facing timestamps use the canonical display format
