import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from './test-compat.ts';

import {
  inspectRollbackState,
  inspectUpdateState,
  performRollback,
  performSelfUpdate,
} from './update.ts';

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeReleaseApp(root: string, version: string, assetName = `kfc-${version}.tar.gz`): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"kfc"}\n', 'utf8');
  await writeFile(join(root, 'src', 'index.ts'), 'export {};\n', 'utf8');
  await writeFile(join(root, 'src', 'kfc.ts'), 'export {};\n', 'utf8');
  await writeJson(join(root, '.kfc-release.json'), {
    repo: 'porcow/kfc',
    version,
    channel: 'stable',
    published_at: '2026-03-16T00:00:00Z',
    asset_name: assetName,
  });
}

async function writeInstallMetadata(root: string, currentVersion: string, previousVersion: string | null = null): Promise<void> {
  await writeJson(join(root, 'install-metadata.json'), {
    install_source: 'github-release',
    repo: 'porcow/kfc',
    channel: 'stable',
    current_version: currentVersion,
    previous_version: previousVersion,
    installed_at: '2026-03-16T01:00:00Z',
    previous_installed_at: previousVersion ? '2026-03-10T09:00:00Z' : null,
  });
}

function createLatestReleaseResponse(version: string, assetName = `kfc-${version}.tar.gz`) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return {
        tag_name: version,
        draft: false,
        prerelease: false,
        published_at: '2026-03-16T02:00:00Z',
        assets: [
          {
            name: assetName,
            browser_download_url: `https://example.invalid/${assetName}`,
          },
        ],
      };
    },
  } satisfies Partial<Response>;
}

test('inspectUpdateState returns up_to_date when installed version matches latest stable release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-update-up-to-date-'));
  await writeInstallMetadata(root, 'v0.2.0');

  const result = await inspectUpdateState({
    installRoot: root,
    fetchImpl: (async () => createLatestReleaseResponse('v0.2.0') as Response) as typeof fetch,
  });

  assert.equal(result.status, 'up_to_date');
  assert.equal(result.currentVersion.version, 'v0.2.0');
  assert.equal(result.latestVersion.version, 'v0.2.0');
  assert.equal(result.summary, 'Already at v0.2.0.');
});

test('inspectUpdateState reports update availability', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-update-available-'));
  await writeInstallMetadata(root, 'v0.1.0');

  const result = await inspectUpdateState({
    installRoot: root,
    fetchImpl: (async () => createLatestReleaseResponse('v0.2.0') as Response) as typeof fetch,
  });

  assert.equal(result.status, 'update_available');
  assert.equal(result.currentVersion.version, 'v0.1.0');
  assert.equal(result.latestVersion.version, 'v0.2.0');
  assert.equal(result.latestVersion.assetName, 'kfc-v0.2.0.tar.gz');
});

test('inspectUpdateState blocks unusable metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-update-blocked-'));
  const result = await inspectUpdateState({
    installRoot: root,
    fetchImpl: (async () => createLatestReleaseResponse('v0.2.0') as Response) as typeof fetch,
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.summary, /install metadata is unusable/);
});

test('inspectRollbackState requires app.previous and previous-version metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-rollback-inspect-'));
  await mkdir(join(root, 'app.previous'), { recursive: true });
  await writeInstallMetadata(root, 'v0.2.0', 'v0.1.0');

  const available = await inspectRollbackState({ installRoot: root });
  assert.equal(available.status, 'rollback_available');
  assert.equal(available.currentVersion.version, 'v0.2.0');
  assert.equal(available.previousVersion.version, 'v0.1.0');

  const blockedRoot = await mkdtemp(join(tmpdir(), 'kids-alfred-rollback-blocked-'));
  await writeInstallMetadata(blockedRoot, 'v0.2.0');
  const blocked = await inspectRollbackState({ installRoot: blockedRoot });
  assert.deepEqual(blocked, {
    status: 'blocked',
    summary: 'No rollback version is available.',
  });
});

test('performSelfUpdate stages release, refreshes service, and rewrites install metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-perform-update-'));
  await writeReleaseApp(join(root, 'app'), 'v0.1.0');
  await writeInstallMetadata(root, 'v0.1.0', 'v0.0.9');

  const result = await performSelfUpdate(
    {
      status: 'update_available',
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.1.0',
        channel: 'stable',
        publishedAt: '2026-03-16T01:00:00Z',
        assetName: 'kfc-v0.1.0.tar.gz',
      },
      latestVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T02:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
        downloadUrl: 'https://example.invalid/kfc-v0.2.0.tar.gz',
      },
      summary: 'Update available: v0.1.0 -> v0.2.0.',
    },
    {
      installRoot: root,
      fetchImpl: (async (input) => {
        const url = String(input);
        if (url.includes('/releases/latest')) {
          return createLatestReleaseResponse('v0.2.0') as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async arrayBuffer() {
            return new TextEncoder().encode('archive').buffer;
          },
        } as Response;
      }) as typeof fetch,
      extractTarGz: async (_archivePath, destination) => {
        const extracted = join(destination, 'kfc-v0.2.0');
        await mkdir(extracted, { recursive: true });
        await writeReleaseApp(extracted, 'v0.2.0');
      },
      installDependencies: async () => {},
      serviceInstaller: async () => {},
      configPath: '/config.toml',
      now: () => new Date('2026-03-16T03:00:00.000Z'),
    },
  );

  assert.equal(result.summary, 'Update complete. Current version: v0.2.0.');
  const metadata = JSON.parse(await readFile(join(root, 'install-metadata.json'), 'utf8'));
  assert.equal(metadata.current_version, 'v0.2.0');
  assert.equal(metadata.previous_version, 'v0.1.0');
  assert.equal(metadata.installed_at, '2026-03-16T03:00:00.000Z');
});

test('performSelfUpdate reports automatic rollback status when service refresh fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-perform-update-fail-'));
  await writeReleaseApp(join(root, 'app'), 'v0.1.0');
  await writeInstallMetadata(root, 'v0.1.0');

  await assert.rejects(
    () =>
      performSelfUpdate(
        {
          status: 'update_available',
          currentVersion: {
            repo: 'porcow/kfc',
            version: 'v0.1.0',
            channel: 'stable',
            publishedAt: '2026-03-16T01:00:00Z',
            assetName: 'kfc-v0.1.0.tar.gz',
          },
          latestVersion: {
            repo: 'porcow/kfc',
            version: 'v0.2.0',
            channel: 'stable',
            publishedAt: '2026-03-16T02:00:00Z',
            assetName: 'kfc-v0.2.0.tar.gz',
            downloadUrl: 'https://example.invalid/kfc-v0.2.0.tar.gz',
          },
          summary: 'Update available',
        },
        {
          installRoot: root,
          fetchImpl: (async () =>
            ({
              ok: true,
              status: 200,
              statusText: 'OK',
              async arrayBuffer() {
                return new TextEncoder().encode('archive').buffer;
              },
            } as Response)) as typeof fetch,
          extractTarGz: async (_archivePath, destination) => {
            const extracted = join(destination, 'kfc-v0.2.0');
            await mkdir(extracted, { recursive: true });
            await writeReleaseApp(extracted, 'v0.2.0');
          },
          installDependencies: async () => {},
          serviceInstaller: async () => {
            throw new Error('launchd failed');
          },
          configPath: '/config.toml',
        },
      ),
    /Update failed during service refresh; rolled back to v0.1.0./,
  );
});

test('performRollback swaps app directories and rewrites install metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-perform-rollback-'));
  await writeReleaseApp(join(root, 'app'), 'v0.2.0');
  await writeReleaseApp(join(root, 'app.previous'), 'v0.1.0');
  await writeInstallMetadata(root, 'v0.2.0', 'v0.1.0');

  const result = await performRollback(
    {
      status: 'rollback_available',
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T01:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
      },
      previousVersion: {
        repo: 'porcow/kfc',
        version: 'v0.1.0',
        channel: 'stable',
        publishedAt: '2026-03-10T09:00:00Z',
        assetName: 'kfc-v0.1.0.tar.gz',
      },
      summary: 'Rollback available: v0.2.0 -> v0.1.0.',
    },
    {
      installRoot: root,
      serviceInstaller: async () => {},
      configPath: '/config.toml',
      now: () => new Date('2026-03-16T04:00:00.000Z'),
    },
  );

  assert.equal(result.summary, 'Rollback complete. Current version: v0.1.0.');
  const metadata = JSON.parse(await readFile(join(root, 'install-metadata.json'), 'utf8'));
  assert.equal(metadata.current_version, 'v0.1.0');
  assert.equal(metadata.previous_version, 'v0.2.0');
});
