## 1. Failure Inventory

- [x] 1.1 Run direct `bun test` and inventory all remaining failures.
- [x] 1.2 Classify failures into unsupported `node:test` patterns, brittle assertions, timeout/timing issues, and true runtime incompatibilities.

## 2. Test Refactors

- [x] 2.1 Rewrite remaining Bun-incompatible `node:test` structures into Bun-compatible forms.
- [x] 2.2 Replace brittle Node-specific assertions with runtime-neutral behavior assertions.
- [x] 2.3 Fix ordering-sensitive tests by sorting or otherwise asserting the intended contract explicitly.
- [x] 2.4 Fix timeout-sensitive tests so they remain deterministic under Bun.

## 3. Script And Docs Switch

- [x] 3.1 Switch `package.json` `test` to Bun only after direct `bun test` is green.
- [x] 3.2 Update README and manual verification guidance to describe Bun as the supported test runner.

## 4. Verification

- [x] 4.1 Verify `bun test` passes for the supported repository suite.
- [x] 4.2 Verify the package `test` script passes after switching to Bun.
- [x] 4.3 Validate the OpenSpec change and confirm it is ready for archive.
