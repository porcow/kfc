## Why

The repository now supports Bun for dependency installation and repository-local `start` / `dev`, but the test suite still depends on Node's built-in test runner through `bun run test -> node --test`.

Direct `bun test` remains unsupported because the suite still contains runner-specific assumptions and brittle assertions that do not hold under Bun. That leaves the project in a mixed state where Bun is part of local development, but not the canonical test runtime.

## What Changes

- migrate the repository test suite so `bun test` is the supported primary test runner
- remove or refactor remaining `node:test` patterns that Bun does not support reliably
- tighten tests around runtime-neutral behavior instead of Node-specific timing, ordering, or formatting side effects
- switch the `test` package script from Node's test runner to Bun only after the full suite is green under Bun

## Impact

- developers can use Bun consistently for install, local service execution, and tests
- test failures caused by Node-vs-Bun runner differences become explicit migration tasks instead of hidden behind `bun run test -> node`
- some tests will be rewritten for clearer behavioral assertions rather than runner-specific mechanics
