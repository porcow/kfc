## 1. Persistence Compatibility Layer

- [x] 1.1 Design and introduce a storage abstraction that removes the direct `node:sqlite` dependency from the repository-facing persistence boundary.
- [x] 1.2 Keep the existing Node-backed persistence behavior behind the new abstraction.
- [x] 1.3 Add a Bun-compatible persistence backend suitable for repository-local runtime execution.

## 2. Phase 1 Local Runtime Support

- [x] 2.1 Wire the repository-local Bun runtime path so `start` and `dev` can execute without failing on `node:sqlite`.
- [x] 2.2 Verify that the existing Node local runtime path still works after the abstraction change.
- [x] 2.3 Update runtime-sensitive docs or guidance only as far as Bun local runtime support is actually completed.

## 3. Phase 2 Test Compatibility Planning

- [x] 3.1 Inventory the current Bun-incompatible test patterns, including nested `node:test` usage.
- [x] 3.2 Refactor or replace incompatible test constructs as part of the Bun test-compatibility phase.
- [x] 3.3 Define verification criteria for when `bun run test` can be considered supported.

## 4. Verification

- [x] 4.1 Validate the OpenSpec change and confirm it is ready for implementation.
