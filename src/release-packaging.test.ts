import { test } from './test-compat.ts';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildReleaseAssetName,
  buildReleaseMetadata,
  listArchiveEntries,
  readEmbeddedReleaseMetadataFromArchive,
  RELEASE_METADATA_FILE,
  type ReleaseMetadata,
} from './release-packaging.ts';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('release packaging metadata uses the canonical asset naming contract', () => {
  assert.equal(buildReleaseAssetName('v0.2.0'), 'kfc-v0.2.0.tar.gz');
  assert.deepEqual(
    buildReleaseMetadata({
      repo: 'porcow/kfc',
      version: 'v0.2.0',
      publishedAt: '2026-03-16T00:00:00Z',
    }),
    {
      repo: 'porcow/kfc',
      version: 'v0.2.0',
      channel: 'stable',
      published_at: '2026-03-16T00:00:00Z',
      asset_name: 'kfc-v0.2.0.tar.gz',
    } satisfies ReleaseMetadata,
  );
});

test('release packaging script stages a tarball with embedded metadata and required entrypoints', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'kids-alfred-release-package-'));
  const scriptPath = join(projectRoot, 'scripts', 'package-release.ts');

  await execFileAsync('bun', [
    scriptPath,
    '--repo-root',
    projectRoot,
    '--output-dir',
    outputDir,
    '--repo',
    'porcow/kfc',
    '--version',
    'v0.2.0',
    '--published-at',
    '2026-03-16T00:00:00Z',
  ]);

  const assetName = 'kfc-v0.2.0.tar.gz';
  const assetPath = join(outputDir, assetName);
  const metadata = await readEmbeddedReleaseMetadataFromArchive(assetPath);

  assert.equal(metadata.asset_name, assetName);
  assert.equal(metadata.version, 'v0.2.0');
  assert.equal(metadata.repo, 'porcow/kfc');

  const listing = await listArchiveEntries(assetPath);
  assert.ok(listing.includes('src/index.ts'));
  assert.ok(listing.includes('src/kfc.ts'));
  assert.ok(listing.includes('package.json'));
  assert.ok(listing.includes('bun.lock'));
  assert.ok(listing.includes('.kfc-release.json'));

  const manifest = JSON.parse(await readFile(join(outputDir, `${assetName}.manifest.json`), 'utf8')) as {
    assetName: string;
  };
  assert.equal(manifest.assetName, assetName);
});
