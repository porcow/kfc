## 1. Install And CLI Runtime

- [x] 1.1 Remove the Node prerequisite and Node inline scripts from `install.sh`.
- [x] 1.2 Update the repository-local `./kfc` wrapper so it executes through Bun instead of Node.
- [x] 1.3 Keep installed launcher, service install, update, rollback, and uninstall semantics unchanged apart from removing Node as a prerequisite.

## 2. Runtime Compatibility Cleanup

- [x] 2.1 Remove the `node:sqlite` branch from `src/persistence/sqlite.ts` and keep Bun as the only supported runtime backend.
- [x] 2.2 Remove the `node:test` fallback from test compatibility code and make Bun the only supported test runner path.
- [x] 2.3 Update tests that still assume Node runtime entrypoints or Node-only compatibility behavior.

## 3. Bun Compatibility Validation

- [x] 3.1 Verify sqlite-backed repository/service/runtime tests still pass under Bun-only assumptions.
- [x] 3.2 Verify Feishu SDK-dependent tests still pass under Bun and do not require Node runtime fallback.
- [x] 3.3 Update docs and manual verification guidance to state that Node is no longer a supported prerequisite for install, runtime, or tests.

## 4. Verification

- [x] 4.1 Run focused tests for install, wrapper, sqlite, runtime, and Feishu-related paths.
- [x] 4.2 Run the full Bun test suite.
- [x] 4.3 Validate the OpenSpec change and confirm it is ready for archive.
