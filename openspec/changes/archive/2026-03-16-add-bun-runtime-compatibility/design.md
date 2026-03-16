## Context

The repository has already adopted Bun for dependency installation, but Bun runtime execution currently fails for two independent reasons:

- service startup fails because the persistence layer imports `node:sqlite`
- parts of the test suite fail because Bun does not yet support some of the repository's current `node:test` usage patterns, including nested `t.test(...)`

That means Bun runtime adoption is not blocked by a script name or command choice. It is blocked by real compatibility gaps in both the application runtime and the test harness.

The user has chosen this strategy:

- runtime compatibility layer: yes
- testing compatibility work: yes
- split into phases: yes

Phase 1 should make local Bun runtime viable for service entrypoints such as `bun run start` and `bun run dev`. Phase 2 should make tests compatible with Bun and decide whether `bun run test` becomes a supported default.

## Goals / Non-Goals

**Goals:**
- Remove the direct repository-level requirement that local Bun runtime must support `node:sqlite`.
- Introduce a persistence abstraction that supports both Node and Bun local runtimes.
- Make repository-local service execution compatible with Bun in Phase 1 without regressing Node behavior.
- Define a path for Phase 2 test compatibility work, including incompatible `node:test` constructs.
- Keep installed production launcher and managed service behavior stable while compatibility work is in progress.

**Non-Goals:**
- Forcing the installed launcher or launchd-managed service onto Bun in this change.
- Rewriting the entire codebase around Bun-only APIs.
- Treating Bun runtime adoption as a pure docs or script-string change.
- Guaranteeing full Bun test-runner compatibility in the same phase as the persistence abstraction unless explicitly completed as part of Phase 2.

## Decisions

### Persistence moves behind a runtime-compatible storage abstraction

The current direct dependency on `node:sqlite` in [src/persistence/run-repository.ts](/Users/porco/Projects/KidsAlfred/src/persistence/run-repository.ts) should be replaced by an abstraction that exposes the repository's required database operations independent of the concrete SQLite driver.

The design target is:

- Node local/runtime path:
  - continue using `node:sqlite`
- Bun local/runtime path:
  - use a Bun-compatible SQLite backend

Alternative considered: keep `RunRepository` as-is and shell out to Node only when Bun hits `node:sqlite`. Rejected because it does not provide real Bun runtime compatibility; it only disguises the missing backend.

### Bun runtime compatibility is phased

Phase 1:
- make local service entrypoints (`start`, `dev`) run under Bun
- finish persistence compatibility
- keep Node as the stable baseline

Phase 2:
- address Bun test-runner incompatibilities
- replace or refactor incompatible `node:test` patterns
- decide whether `bun run test` becomes fully supported

Alternative considered: require both runtime and test-runner migration in one step. Rejected because the current blockers are large enough that combining them would make verification and rollback unnecessarily risky.

### Test compatibility is treated as code compatibility, not only tooling configuration

The current failures are not only due to which command invokes tests. Some tests depend on features Bun does not implement yet, such as nested `t.test(...)`. That means Phase 2 must treat test compatibility as a code-change project.

Alternative considered: just keep Node test execution forever while switching app runtime to Bun. Rejected because the user explicitly wants test runtime compatibility work to be part of the roadmap.

### Production runtime remains Node during the compatibility phases

This change does not alter:

- installed launcher generation
- launchd program arguments
- production service runtime contract

That keeps compatibility work focused on repository-local Bun viability first.

Alternative considered: switch local and production runtime together once Bun can start the service. Rejected because production runtime migration should remain a separate operational decision.

## Risks / Trade-offs

- [Introducing a storage abstraction could increase complexity around transactions and schema initialization] -> Keep the abstraction scoped to the repository's actual required operations and verify behavior through the existing persistence-focused tests.
- [Node and Bun backends could diverge semantically] -> Treat Node behavior as the baseline contract and validate Bun against the same repository tests.
- [Phase 1 could finish while Phase 2 remains incomplete, leaving mixed runtime expectations] -> Document the phase boundary explicitly and avoid claiming `bun run test` support until Phase 2 is done.
- [Bun-compatible SQLite backend selection could constrain future portability] -> Limit the abstraction boundary to current local repository execution needs and defer broader backend policy until runtime compatibility is proven.

## Migration Plan

1. Introduce a persistence abstraction that decouples repository logic from `node:sqlite`.
2. Implement and verify the Node backend against existing behavior.
3. Implement a Bun-compatible backend and make local Bun runtime entrypoints use it.
4. Verify `bun run start` and `bun run dev` for repository-local execution.
5. In Phase 2, refactor Bun-incompatible test patterns and verify `bun run test`.

Rollback strategy:
- Keep the Node backend as the default stable path throughout the migration.
- If Bun compatibility work regresses local runtime behavior, revert Bun runtime wiring while preserving the abstraction and the Node backend.

## Open Questions

None for v1. The compatibility work is explicitly split into local runtime first and test runtime second.
