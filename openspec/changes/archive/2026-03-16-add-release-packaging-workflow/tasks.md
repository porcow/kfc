## 1. Packaging Pipeline

- [x] 1.1 Add a release packaging workflow under `.github/workflows/` triggered by version tags.
- [x] 1.2 Add a packaging step or script that stages runtime files and generates `.kfc-release.json`.
- [x] 1.3 Produce the canonical asset name `kfc-vX.Y.Z.tar.gz`.

## 2. Verification

- [x] 2.1 Verify the tarball contains `.kfc-release.json`, `src/index.ts`, `src/kfc.ts`, and `package.json`.
- [x] 2.2 Verify embedded `asset_name` matches the uploaded tarball filename.
- [x] 2.3 Ensure the workflow publishes or updates the GitHub Release asset for the matching tag.

## 3. Docs

- [x] 3.1 Document the release packaging flow for maintainers.
- [x] 3.2 Clarify that install/update consume the workflow-produced GitHub Release tarball.

## 4. Validation

- [x] 4.1 Validate the OpenSpec change and confirm it is ready for archive after implementation.
