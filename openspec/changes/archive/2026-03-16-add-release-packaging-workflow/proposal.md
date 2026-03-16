## Why

The current install and update logic already assumes a GitHub Release tarball model:

- `install.sh` downloads the latest stable GitHub Release asset
- self-update compares local install metadata against the latest stable GitHub Release
- extracted release assets must contain `.kfc-release.json`

But the repository does not yet provide a release packaging workflow that actually creates that asset and embeds the required metadata. That leaves a gap between the runtime design and the publish pipeline.

## What Changes

- Add a GitHub Release packaging workflow triggered by version tags.
- Generate `.kfc-release.json` during release packaging.
- Build a canonical `kfc-vX.Y.Z.tar.gz` asset from the repository contents required at runtime.
- Upload the tarball to the corresponding GitHub Release.
- Validate that the tarball contains the required runtime files and embedded release metadata.

## Impact

- `install.sh` and release-based update/rollback will have a real canonical release artifact to consume.
- `.kfc-release.json` becomes an actual published artifact input instead of a design-only concept.
- Release publication gains a repeatable packaging contract instead of relying on manual archives.
