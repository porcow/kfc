## 1. Package Manager Metadata

- [x] 1.1 Update [package.json](/Users/porco/Projects/KidsAlfred/package.json) to declare Bun as the supported package manager without changing the existing Node-based runtime scripts.
- [x] 1.2 Remove `package-lock.json` from the supported workflow and generate the Bun lockfile artifact.
- [x] 1.3 Update any package-manager-sensitive tests so they validate Bun-based install expectations instead of npm-specific lockfile ownership.

## 2. Host Install Flow

- [x] 2.1 Update [install.sh](/Users/porco/Projects/KidsAlfred/install.sh) to use Bun for dependency installation while preserving the existing Node-based launcher and service-install behavior.
- [x] 2.2 Add clear installer handling for hosts where `bun` is not already available.
- [x] 2.3 Keep the runtime contract unchanged after installation: Node continues to execute start, dev, test, and launchd entrypoints.

## 3. Docs and Verification

- [x] 3.1 Update [README.md](/Users/porco/Projects/KidsAlfred/README.md) quick-start and host-install guidance to describe the Bun-for-install, Node-for-runtime boundary.
- [x] 3.2 Update [docs/manual-verification.md](/Users/porco/Projects/KidsAlfred/docs/manual-verification.md) with Bun-based install verification steps.
- [x] 3.3 Validate the OpenSpec change and confirm it is ready for implementation.
