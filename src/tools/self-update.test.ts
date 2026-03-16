import assert from 'node:assert/strict';
import { test } from '../test-compat.ts';

import { createSelfUpdateTool } from './self-update.ts';

test('self-update tool reports already-latest inspection results without executing an update', async () => {
  let performCalls = 0;
  const tool = createSelfUpdateTool({
    inspect: async () => ({
      status: 'up_to_date',
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T00:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
      },
      latestVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T00:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
      },
      summary: 'Already at v0.2.0.',
    }),
    perform: async () => {
      performCalls += 1;
      throw new Error('unexpected perform');
    },
  });

  const result = await tool.execute({
    runId: 'run_1',
    signal: new AbortController().signal,
    task: {
      id: 'update',
      runnerKind: 'builtin-tool',
      executionMode: 'oneshot',
      description: 'Update this deployment',
      tool: 'self-update',
      timeoutMs: 300000,
      cancellable: false,
      parameters: {},
    },
    actorId: 'operator-1',
    parameters: {},
  });

  assert.equal(performCalls, 0);
  assert.equal(result.summary, 'Already at v0.2.0.');
});

test('self-update tool executes available updates', async () => {
  let performCalls = 0;
  const tool = createSelfUpdateTool({
    inspect: async () => ({
      status: 'update_available',
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.1.0',
        channel: 'stable',
        publishedAt: '2026-03-16T00:00:00Z',
        assetName: 'kfc-v0.1.0.tar.gz',
      },
      latestVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T00:00:00Z',
        assetName: 'kfc-v0.2.0.tar.gz',
        downloadUrl: 'https://example.invalid/kfc-v0.2.0.tar.gz',
      },
      summary: 'Update available: v0.1.0 -> v0.2.0.',
    }),
    perform: async (inspection) => {
      performCalls += 1;
      assert.equal(inspection.status, 'update_available');
      return {
        previousVersion: inspection.currentVersion,
        currentVersion: inspection.latestVersion,
        summary: 'Update complete. Current version: v0.2.0.',
      };
    },
  });

  const result = await tool.execute({
    runId: 'run_2',
    signal: new AbortController().signal,
    task: {
      id: 'update',
      runnerKind: 'builtin-tool',
      executionMode: 'oneshot',
      description: 'Update this deployment',
      tool: 'self-update',
      timeoutMs: 300000,
      cancellable: false,
      parameters: {},
    },
    actorId: 'operator-1',
    parameters: {},
  });

  assert.equal(performCalls, 1);
  assert.equal(result.summary, 'Update complete. Current version: v0.2.0.');
});

test('self-update tool surfaces blocked states as errors', async () => {
  const tool = createSelfUpdateTool({
    inspect: async () => ({
      status: 'blocked',
      summary: 'Update blocked: install metadata is unusable.',
    }),
  });

  await assert.rejects(
    () =>
      tool.execute({
        runId: 'run_3',
        signal: new AbortController().signal,
        task: {
          id: 'update',
          runnerKind: 'builtin-tool',
          executionMode: 'oneshot',
          description: 'Update this deployment',
          tool: 'self-update',
          timeoutMs: 300000,
          cancellable: false,
          parameters: {},
        },
        actorId: 'operator-1',
        parameters: {},
      }),
    /Update blocked: install metadata is unusable./,
  );
});
