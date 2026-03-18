import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from './test-compat.ts';
import type { RunRecord } from './domain.ts';
import {
  prepareSelfUpdateHandoff,
  reconcilePendingServiceRefreshOperations,
  runDetachedServiceRefreshOperation,
} from './service-refresh.ts';
import { ServiceRefreshRepository } from './persistence/service-refresh-repository.ts';
import { RunRepository } from './persistence/run-repository.ts';

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function repoPath(root: string): string {
  return join(root, 'service-refresh.sqlite');
}

test('prepareSelfUpdateHandoff persists the operation and schedules the one-shot helper', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-self-refresh-prepare-'));
  const launchctlCalls: string[][] = [];

  const result = await prepareSelfUpdateHandoff(
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
      configPath: '/config.toml',
      execFileAsync: (async (_file, args) => {
        launchctlCalls.push([...args]);
        return { stdout: '', stderr: '' };
      }) as any,
    },
  );

  assert.match(result.summary, /Update handed off/u);
  const repo = new ServiceRefreshRepository(repoPath(root));
  const operations = repo.listByStates(['helper_bootstrapped']);
  repo.close();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].kind, 'update');
  assert.ok(operations[0].helperPlistPath?.endsWith('.plist'));
  assert.equal(launchctlCalls[0]?.[0], 'bootstrap');
  assert.equal(launchctlCalls[1]?.[0], 'kickstart');
});

test('prepareSelfUpdateHandoff fails before refresh when helper scheduling fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-self-refresh-prepare-fail-'));

  await assert.rejects(
    () =>
      prepareSelfUpdateHandoff(
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
          configPath: '/config.toml',
          execFileAsync: (async () => {
            throw new Error('bootstrap failed');
          }) as any,
        },
      ),
    /Failed to start detached self-refresh helper/u,
  );

  const repo = new ServiceRefreshRepository(repoPath(root));
  const failed = repo.listByStates(['failed']);
  repo.close();
  assert.equal(failed.length, 1);
  assert.match(failed[0].summary ?? '', /Failed to start detached self-refresh helper/u);
});

test('runDetachedServiceRefreshOperation claims the operation and updates the linked run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-self-refresh-helper-'));
  const sqlitePath = join(root, 'bot.sqlite');
  const runRepo = new RunRepository(sqlitePath);
  const now = '2026-03-17T10:00:00.000Z';
  runRepo.createRunWithConfirmation({
    runId: 'run_1',
    taskId: 'update',
    taskType: 'builtin-tool',
    actorId: 'operator-1',
    confirmationId: 'confirm_1',
    state: 'running',
    parameters: {},
    parameterSummary: '',
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    originChatId: 'chat-1',
    cancellable: false,
  });
  runRepo.close();

  const repo = new ServiceRefreshRepository(repoPath(root));
  repo.createOperation({
    operationId: 'op_1',
    kind: 'update',
    state: 'helper_bootstrapped',
    configPath: '/config.toml',
    payloadJson: JSON.stringify({
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.1.0',
        channel: 'stable',
        publishedAt: '2026-03-16T01:00:00Z',
        assetName: 'kfc-v0.1.0.tar.gz',
      },
      targetVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T02:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
        downloadUrl: 'https://example.invalid/kfc-v0.2.0.tar.gz',
      },
    }),
    runId: 'run_1',
    botId: 'alpha',
    sqlitePath,
    helperLabel: 'com.kidsalfred.self-refresh.op_1',
    helperPlistPath: join(root, 'helper.plist'),
    notificationPending: true,
    createdAt: now,
    updatedAt: now,
  });
  repo.close();

  const result = await runDetachedServiceRefreshOperation('op_1', {
    installRoot: root,
    execFileAsync: (async () => ({ stdout: '', stderr: '' })) as any,
    performSelfUpdateImpl: async (inspection) => ({
      previousVersion: inspection.currentVersion,
      currentVersion: inspection.latestVersion,
      summary: 'Update complete. Current version: v0.2.0.',
    }),
  });

  assert.equal(result.summary, 'Update complete. Current version: v0.2.0.');
  const verifyRepo = new ServiceRefreshRepository(repoPath(root));
  const operation = verifyRepo.getOperation('op_1');
  verifyRepo.close();
  assert.equal(operation?.state, 'succeeded');
  const verifyRunRepo = new RunRepository(sqlitePath);
  const run = verifyRunRepo.getRun('run_1');
  verifyRunRepo.close();
  assert.equal(run?.state, 'succeeded');
  assert.equal(run?.statusSummary, 'Update complete. Current version: v0.2.0.');
});

test('startup reconciliation restores terminal state and pushes pending run updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kids-alfred-self-refresh-reconcile-'));
  const sqlitePath = join(root, 'bot.sqlite');
  await writeInstallMetadata(root, 'v0.1.0', 'v0.0.9');

  const runRepo = new RunRepository(sqlitePath);
  runRepo.createRunWithConfirmation({
    runId: 'run_2',
    taskId: 'update',
    taskType: 'builtin-tool',
    actorId: 'operator-1',
    confirmationId: 'confirm_2',
    state: 'running',
    parameters: {},
    parameterSummary: '',
    createdAt: '2026-03-17T10:00:00.000Z',
    updatedAt: '2026-03-17T10:00:00.000Z',
    startedAt: '2026-03-17T10:00:00.000Z',
    originChatId: 'chat-2',
    cancellable: false,
  });
  runRepo.close();

  const repo = new ServiceRefreshRepository(repoPath(root));
  repo.createOperation({
    operationId: 'op_2',
    kind: 'update',
    state: 'refreshing',
    configPath: '/config.toml',
    payloadJson: JSON.stringify({
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.1.0',
        channel: 'stable',
        publishedAt: '2026-03-16T01:00:00Z',
        assetName: 'kfc-v0.1.0.tar.gz',
      },
      targetVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T02:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
      },
    }),
    runId: 'run_2',
    botId: 'alpha',
    sqlitePath,
    notificationPending: true,
    createdAt: '2026-03-17T10:00:00.000Z',
    updatedAt: '2026-03-17T10:00:00.000Z',
  });
  repo.close();

  const pushed: RunRecord[] = [];
  await reconcilePendingServiceRefreshOperations(
    new Map([
      [
        'alpha',
        {
          async publishRunUpdate(run) {
            pushed.push(run);
          },
        },
      ],
    ]),
    { installRoot: root },
  );

  const verifyRepo = new ServiceRefreshRepository(repoPath(root));
  const operation = verifyRepo.getOperation('op_2');
  verifyRepo.close();
  assert.equal(operation?.state, 'restored_previous_version');
  assert.equal(operation?.notificationPending, false);

  const verifyRunRepo = new RunRepository(sqlitePath);
  const run = verifyRunRepo.getRun('run_2');
  verifyRunRepo.close();
  assert.equal(run?.state, 'failed');
  assert.match(run?.statusSummary ?? '', /rolled back to v0.1.0/u);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].runId, 'run_2');
});
