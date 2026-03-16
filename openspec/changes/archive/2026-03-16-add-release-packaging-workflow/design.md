## Context

The runtime side of the project already depends on a release artifact contract:

```text
install.sh
  -> query latest GitHub Release
  -> download .tar.gz asset
  -> extract
  -> require .kfc-release.json

kfc update
  -> query latest GitHub Release
  -> download .tar.gz asset
  -> extract
  -> verify .kfc-release.json
```

However, there is currently no repository workflow that produces:

- `kfc-vX.Y.Z.tar.gz`
- embedded `.kfc-release.json`
- a verified GitHub Release asset matching the runtime contract

## Goals / Non-Goals

### Goals

- Produce a canonical GitHub Release tarball from the repository.
- Embed `.kfc-release.json` into the packaged app root.
- Publish the asset on tagged releases.
- Verify that the asset shape matches what `install.sh` and self-update expect.

### Non-Goals

- Publishing prebuilt dependencies or `node_modules`.
- Changing install/update behavior on the host.
- Introducing multiple release channels beyond `stable` in v1.

## Decisions

### Version tags drive release packaging

The workflow will trigger from version tags such as:

```text
v0.2.0
```

The tag name becomes the release version recorded in `.kfc-release.json`.

### The canonical asset name is `kfc-vX.Y.Z.tar.gz`

The release tarball name will be:

```text
kfc-v0.2.0.tar.gz
```

This matches the assumptions already baked into update/install tests and metadata handling.

### `.kfc-release.json` is generated during packaging

The workflow will generate `.kfc-release.json` inside the staged packaging directory with this shape:

```json
{
  "repo": "porcow/kfc",
  "version": "v0.2.0",
  "channel": "stable",
  "published_at": "2026-03-16T00:00:00Z",
  "asset_name": "kfc-v0.2.0.tar.gz"
}
```

Field sources:
- `repo`: GitHub repository slug from workflow context
- `version`: git tag name
- `channel`: fixed `stable`
- `published_at`: workflow-generated UTC timestamp
- `asset_name`: final uploaded tarball name

### The tarball contains the runtime app root, not git history

The tarball will include only files needed by install/runtime, such as:

- `src/`
- `config/`
- `docs/`
- `package.json`
- `bun.lock`
- `install.sh`
- `uninstall.sh`
- `kfc`
- `.kfc-release.json`

It will not include `.git/` or repository-only transient artifacts.

### Packaging verification is part of the workflow

Before upload, the workflow must verify:

- the tarball exists
- `.kfc-release.json` is present inside the tarball
- `src/index.ts`, `src/kfc.ts`, and `package.json` are present
- embedded `.kfc-release.json.asset_name` matches the tarball filename

### Release publication updates the GitHub Release asset set

The workflow should create or update the GitHub Release associated with the tag and upload the tarball as the canonical install/update asset.

## Risks / Trade-offs

- [Release asset contents drift from runtime expectations] -> enforce tarball content verification in the workflow.
- [Manual releases bypass packaging rules] -> keep the canonical artifact generated only through the workflow.
- [Published timestamp differs slightly from GitHub Release publish time] -> acceptable; workflow packaging time is sufficient for embedded metadata.

## Migration Plan

1. Add a GitHub Actions workflow for tagged release packaging.
2. Add a small packaging script that stages files and writes `.kfc-release.json`.
3. Add tests or verification for packaging metadata generation where practical.
4. Publish future tagged releases through this workflow so install/update have a valid asset source.

## Rollback Strategy

If the workflow proves incorrect:

- disable the packaging workflow
- revert to manual GitHub Release asset publication temporarily
- keep install/update behavior unchanged while fixing the packaging pipeline
