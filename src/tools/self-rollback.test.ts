import assert from 'node:assert/strict';
import { test } from '../test-compat.ts';

import { createSelfRollbackTool } from './self-rollback.ts';

test('self-rollback tool executes rollback when a previous version is available', async () => {
  let performCalls = 0;
  const tool = createSelfRollbackTool({
    inspect: async () => ({
      status: 'rollback_available',
      currentVersion: {
        repo: 'porcow/kfc',
        version: 'v0.2.0',
        channel: 'stable',
        publishedAt: '2026-03-16T00:00:00Z',
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
    }),
    perform: async (inspection) => {
      performCalls += 1;
      return {
        previousVersion: inspection.currentVersion,
        currentVersion: inspection.previousVersion,
        summary: 'Rollback complete. Current version: v0.1.0.',
      };
    },
  });

  const result = await tool.execute({
    runId: 'run_rollback_1',
    signal: new AbortController().signal,
    task: {
      id: 'rollback',
      runnerKind: 'builtin-tool',
      executionMode: 'oneshot',
      description: 'Rollback this deployment',
      tool: 'self-rollback',
      timeoutMs: 300000,
      cancellable: false,
      parameters: {},
    },
    actorId: 'operator-1',
    parameters: {},
  });

  assert.equal(performCalls, 1);
  assert.equal(result.summary, 'Rollback complete. Current version: v0.1.0.');
});

test('self-rollback tool surfaces unavailable rollback states as errors', async () => {
  const tool = createSelfRollbackTool({
    inspect: async () => ({
      status: 'blocked',
      summary: 'No rollback version is available.',
    }),
  });

  await assert.rejects(
    () =>
      tool.execute({
        runId: 'run_rollback_2',
        signal: new AbortController().signal,
        task: {
          id: 'rollback',
          runnerKind: 'builtin-tool',
          executionMode: 'oneshot',
          description: 'Rollback this deployment',
          tool: 'self-rollback',
          timeoutMs: 300000,
          cancellable: false,
          parameters: {},
        },
        actorId: 'operator-1',
        parameters: {},
      }),
    /No rollback version is available./,
  );
});
