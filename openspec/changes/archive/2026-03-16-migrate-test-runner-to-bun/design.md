## Context

The repository has already completed Bun-compatible local runtime work for repository-local `start` and `dev`, but the test suite still runs through Node:

- [package.json](/Users/porco/Projects/KidsAlfred/package.json) `test` delegates to `node --test`
- direct `bun test` still fails due to remaining `node:test` incompatibilities and behavior differences

That means Bun is not yet the canonical test runner, even though it is already part of the local toolchain.

## Goals / Non-Goals

**Goals**
- make direct `bun test` pass for the repository test suite
- migrate `package.json` `test` to Bun once the suite is green under Bun
- rewrite tests away from unsupported or brittle `node:test` patterns
- preserve behavioral coverage while reducing runner-specific assumptions

**Non-Goals**
- changing installed production service runtime
- rewriting application code for Bun-only behavior unless required by test compatibility
- preserving Node's test runner as the primary default once Bun migration is complete

## Decisions

### The migration is test-suite first, script switch second

The package script MUST remain Node-backed until direct `bun test` is green for the supported repository suite. Only after that verification should `package.json` `test` be changed to Bun.

### Tests should target behavior, not runner quirks

Migration work should prefer:

- explicit semantic assertions
- deterministic ordering where ordering matters
- runtime-neutral timestamp assertions
- explicit async timeouts only where truly needed

It should avoid:

- assertions tied to Node-only formatting side effects
- implicit reliance on Node scheduler timing
- assertions that depend on unsorted filesystem traversal unless ordering is part of the contract

### Unsupported `node:test` patterns must be removed or isolated

Tests that rely on patterns Bun does not support reliably, including nested `t.test(...)`, must be rewritten into Bun-compatible structure.

### Bun compatibility is measured by direct `bun test`

The acceptance boundary is not "`bun run test` passes while still delegating to Node". The migration is complete only when direct `bun test` passes for the supported repository suite.

## Migration Plan

1. Inventory all remaining direct `bun test` failures.
2. Classify them into:
   - unsupported runner API patterns
   - brittle assertion differences
   - async timing / timeout issues
   - true app/runtime incompatibilities exposed by tests
3. Rewrite the tests to a Bun-compatible structure while preserving coverage intent.
4. Run direct `bun test` until the full suite is green.
5. Switch `package.json` `test` to Bun.
6. Update docs to state Bun is the supported test runner.

## Risks / Trade-offs

- Some tests may need broader restructuring than a minimal patch if their current shape is strongly coupled to Node runner semantics.
- A few assertions may currently be masking underspecified behavior. Rewriting them may expose places where the code should sort or normalize values explicitly.
- Migration should avoid weakening the suite just to satisfy Bun; the standard is equivalent coverage with more portable assertions.

## Open Questions

None for v1. The migration target is explicit: direct `bun test` must pass before the script switch happens.
