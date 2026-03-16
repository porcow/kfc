## Why

The project has already migrated package installation, repository-local execution, the default test runner, and installed service runtime to Bun. The remaining Node dependency is now concentrated in compatibility leftovers:

- `install.sh` still requires Node to parse release metadata and write install metadata
- the repository-local `./kfc` wrapper still uses a Node shebang
- sqlite still carries a `node:sqlite` fallback even though installed runtime is Bun-only
- tests still carry a `node:test` fallback even though Bun is the supported test runner
- Feishu integration still depends on `@larksuiteoapi/node-sdk`, which must be explicitly validated under Bun before Node can be removed as a runtime prerequisite

At this point the project can either stop with a mixed Bun/Node boundary forever, or finish the migration and make Bun the only supported runtime.

## What Changes

- Remove the Node prerequisite from `install.sh` by replacing Node-based JSON handling with Bun.
- Change the repository-local `./kfc` wrapper to execute Bun rather than Node.
- Remove the `node:sqlite` runtime branch and keep only the Bun sqlite backend.
- Remove the `node:test` fallback and make Bun the only supported test runner.
- Validate the Feishu critical path under Bun and treat that validation as part of the runtime-removal contract.
- Update docs and specs so Node is no longer described as a supported runtime prerequisite.

## Impact

- Operators no longer need Node installed to install, run, update, or roll back the service.
- Repository-local CLI and tests become Bun-only.
- The project’s runtime story becomes consistent: Bun for install, local dev, test, installed service, and lifecycle flows.
- Any remaining Node-specific compatibility code can be deleted instead of carried indefinitely.
