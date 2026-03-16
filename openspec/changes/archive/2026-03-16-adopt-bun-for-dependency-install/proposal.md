## Why

The project currently uses `npm` for dependency installation and lockfile management even though the runtime continues to be standard Node.js. Adopting Bun only for package installation is a low-risk migration step that can validate dependency resolution, lockfile stability, and installer behavior without changing production startup semantics.

## What Changes

- Switch the repository's dependency installation workflow from `npm install` to `bun install`.
- Replace `package-lock.json` with Bun lockfile output and update install-related docs accordingly.
- Update host installation flows so fresh installs use Bun for dependency installation while keeping the existing Node-based start, dev, test, and launchd entrypoints unchanged.
- Define the repository's supported package-manager boundary explicitly: Bun for install/lockfile, Node for execution.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-task-execution-audit`: local install and operator-facing setup requirements change from `npm install`-based dependency installation to Bun-based dependency installation while preserving Node runtime entrypoints.

## Impact

- Affected code: [install.sh](/Users/porco/Projects/KidsAlfred/install.sh), [package.json](/Users/porco/Projects/KidsAlfred/package.json), lockfile artifacts, package-manager-sensitive tests, and setup documentation.
- Affected systems: local developer setup, host install workflow, CI/package install expectations, and dependency lockfile management.
- Runtime compatibility boundary: Bun is adopted only for installation; service execution remains on Node.js.
