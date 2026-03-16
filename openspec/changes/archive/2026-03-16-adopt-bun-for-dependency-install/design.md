## Context

The repository is currently minimal from a package-management perspective:

- `package.json` defines Node-based `start`, `dev`, and `test` scripts
- dependency installation is documented as `npm install`
- the host installer currently runs `npm install --omit=dev`
- `package-lock.json` is the only lockfile artifact in the repository

The requested migration is intentionally partial. The project should adopt Bun as the package manager for dependency installation and lockfile generation, while continuing to run the service, tests, and launchd-managed entrypoints with Node.js. That boundary reduces migration risk while still validating whether Bun can resolve and install the project's dependencies reliably.

## Goals / Non-Goals

**Goals:**
- Make `bun install` the supported dependency installation command for repository setup.
- Replace npm lockfile ownership with a Bun lockfile.
- Update host installation so fresh installs use Bun for dependency installation while keeping the runtime on Node.
- Document the runtime boundary clearly so operators do not confuse “package manager” migration with a “runtime” migration.
- Preserve the existing Node-based scripts and launchd execution contract.

**Non-Goals:**
- Rewriting `start`, `dev`, `test`, or launchd entrypoints to run under Bun.
- Introducing Bun-specific runtime APIs or assuming Bun is the process executing the service.
- Redesigning CI beyond the minimum package-manager changes needed to keep install/test expectations coherent.
- Supporting dual lockfile ownership between npm and Bun.

## Decisions

### Bun is adopted only for dependency installation and lockfile management

The repository will switch its install workflow from `npm install` to `bun install`, and Bun will become the authoritative owner of the lockfile. Node remains the execution runtime for:

- `npm start`
- `npm run dev`
- `npm test`
- launchd-managed service entrypoints

Alternative considered: switch both package management and runtime to Bun. Rejected because the user explicitly wants a low-risk first step that validates install compatibility before changing runtime behavior.

### The repository will declare Bun as the preferred package manager explicitly

The project should advertise Bun as the supported installer through repository metadata and docs, for example by adding a `packageManager` field to `package.json` and updating setup guidance to use Bun-first commands.

Alternative considered: rely only on README guidance. Rejected because repository metadata provides clearer tooling expectations and reduces accidental reintroduction of npm-managed lockfiles.

### Bun lockfile replaces npm lockfile as the source of dependency state

`package-lock.json` should be removed from the supported workflow and replaced with the Bun-generated lockfile. The repository should not maintain both lockfiles at once.

Alternative considered: keep both npm and Bun lockfiles temporarily. Rejected because dual lockfile ownership creates ambiguity about which dependency graph is authoritative.

### Host installation uses Bun for dependency installation but keeps Node for execution

`install.sh` should stop invoking `npm install --omit=dev` and instead run the Bun equivalent during fresh install. Because the installer is meant for fresh hosts, it also needs a predictable Bun availability story:

- prefer an existing `bun` binary when present
- otherwise bootstrap Bun through a supported install path or fail clearly with actionable guidance

After dependency installation completes, the existing Node-based launcher and service-install behavior remain unchanged.

Alternative considered: require operators to install Bun manually before using `install.sh`. Rejected because it makes the supported host install flow incomplete and inconsistent with the existing single-command install experience.

### Development and operator docs must separate “install tool” from “runtime”

The documentation should explicitly distinguish:

- package install command: `bun install`
- service/runtime command: Node-based `npm start`, `npm run dev`, `npm test`, and launchd entrypoints

This distinction matters because otherwise operators could incorrectly assume the runtime has switched to Bun just because the package manager did.

Alternative considered: keep docs terse and let the scripts imply runtime boundaries. Rejected because the migration is intentionally partial and easy to misinterpret without explicit wording.

## Risks / Trade-offs

- [Bun may resolve dependencies differently from npm] -> Keep the migration scoped to install/lockfile only, retain Node runtime, and require successful test verification before considering broader runtime changes.
- [Fresh host installs could fail if Bun is unavailable] -> Make `install.sh` either bootstrap Bun or fail with a clear remediation path.
- [Developers may accidentally regenerate `package-lock.json`] -> Make Bun the documented and declared package manager, remove npm lockfile ownership, and update tests/docs to catch regression.
- [Operators may assume runtime moved to Bun] -> State explicitly in README and install docs that Node remains the execution runtime.

## Migration Plan

1. Update repository metadata and docs so Bun is the supported install tool.
2. Remove `package-lock.json` from the supported workflow and generate the Bun lockfile.
3. Update `install.sh` to use Bun-based dependency installation while preserving Node-based runtime setup.
4. Update tests and any package-manager-sensitive docs/scripts.
5. Verify that Node-based `start`, `dev`, and `test` flows still work against the Bun-installed dependency tree.

Rollback strategy for this change:
- Restore `package-lock.json` as the authoritative lockfile.
- Change docs and installer steps back to `npm install --omit=dev`.
- Keep Node runtime semantics unchanged throughout either path.

## Open Questions

None for v1. The migration boundary is explicitly “Bun for install, Node for execution.”
