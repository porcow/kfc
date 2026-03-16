## 1. Runtime Generation

- [x] 1.1 Add or reuse an installed Bun executable-path resolver suitable for launcher and launchd generation.
- [x] 1.2 Update `install.sh` so the installed `kfc` launcher executes Bun rather than Node.
- [x] 1.3 Update main-service plist generation so `kfc service install` writes Bun-based `ProgramArguments`.
- [x] 1.4 Update cronjob plist generation so launchd-managed cronjobs execute through Bun.

## 2. Lifecycle Compatibility

- [x] 2.1 Verify release-based update continues to refresh the managed service under Bun runtime assumptions.
- [x] 2.2 Verify release-based rollback continues to refresh the managed service under Bun runtime assumptions.
- [x] 2.3 Keep uninstall/service lifecycle semantics unchanged apart from the runtime executable swap.

## 3. Tests And Docs

- [x] 3.1 Update launcher/plist/script tests that currently assert Node runtime invocation.
- [x] 3.2 Update README and manual verification guidance to describe Bun as the installed-service runtime.

## 4. Verification

- [x] 4.1 Run the relevant focused tests for install/service/cron/update paths.
- [x] 4.2 Run the full test suite.
- [x] 4.3 Validate the OpenSpec change and confirm it is ready for archive.
