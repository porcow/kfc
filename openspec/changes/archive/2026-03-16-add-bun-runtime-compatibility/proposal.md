## Why

The repository can already install dependencies with Bun, but Bun cannot yet run the local service or the current test suite successfully. The immediate blockers are concrete runtime incompatibilities: the service depends on `node:sqlite`, and parts of the test suite depend on `node:test` behavior that Bun does not implement. A dedicated compatibility change is needed before any meaningful Bun runtime migration can proceed.

## What Changes

- Introduce a Bun-compatible runtime abstraction for persistence so local Bun execution does not depend directly on `node:sqlite`.
- Preserve the current Node-backed persistence path while adding a Bun-compatible implementation behind the same repository boundary.
- Define a phased Bun runtime migration:
  - Phase 1: make Bun capable of running local service entrypoints such as `start` and `dev`
  - Phase 2: make the test suite compatible with Bun runtime and Bun test execution semantics
- Reframe Bun runtime adoption as a compatibility project rather than a simple script rewrite.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: local runtime requirements expand to support a Bun-compatible repository-local execution path without removing the existing Node-based execution path during the migration.

## Impact

- Affected code: [src/persistence/run-repository.ts](/Users/porco/Projects/KidsAlfred/src/persistence/run-repository.ts), persistence and repository consumers, local runtime entrypoints, and Bun-incompatible tests such as [src/update.test.ts](/Users/porco/Projects/KidsAlfred/src/update.test.ts) and [src/tools/self-update.test.ts](/Users/porco/Projects/KidsAlfred/src/tools/self-update.test.ts).
- Affected systems: repository-local `start` / `dev` runtime behavior, persistence backend selection, and test-runner compatibility.
- Migration posture: Node remains the stable baseline while Bun compatibility is added in phases.
