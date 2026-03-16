## ADDED Requirements

### Requirement: GitHub Release artifacts are packaged through a canonical workflow
The project SHALL provide a repeatable release packaging workflow that produces the GitHub Release tarball consumed by host install and release-based update flows.

#### Scenario: Version tag produces the canonical tarball asset
- **WHEN** a maintainer publishes a supported version tag
- **THEN** the release workflow produces a tarball named `kfc-vX.Y.Z.tar.gz`
- **AND** it publishes that tarball as the canonical GitHub Release asset for the tag

#### Scenario: Embedded release metadata is generated during packaging
- **WHEN** the release workflow stages the runtime app contents
- **THEN** it generates `.kfc-release.json` inside the packaged app root
- **AND** that metadata includes `repo`, `version`, `channel`, `published_at`, and `asset_name`

#### Scenario: Tarball content is verified before publication
- **WHEN** the release workflow prepares the canonical tarball
- **THEN** it verifies the asset contains `.kfc-release.json`
- **AND** it verifies required runtime entrypoints such as `src/index.ts`, `src/kfc.ts`, and `package.json`
- **AND** it verifies the embedded `asset_name` matches the tarball filename
