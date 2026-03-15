import assert from 'node:assert/strict';
import test from 'node:test';

import { createSelfUpdateTool } from './self-update.ts';

test('self-update tool reports already-latest inspection results without executing an update', async () => {
  let performCalls = 0;
  const tool = createSelfUpdateTool({
    inspect: async () => ({
      status: 'up_to_date',
      currentVersion: { branch: 'main', commit: 'abc1234', upstreamBranch: 'origin/main' },
      latestVersion: { branch: 'main', commit: 'abc1234', upstreamBranch: 'origin/main' },
      summary: 'Already up to date at main@abc1234.',
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
  assert.equal(result.summary, 'Already up to date at main@abc1234.');
});

test('self-update tool executes available updates and surfaces blocked states as errors', async (t) => {
  await t.test('available update', async () => {
    let performCalls = 0;
    const tool = createSelfUpdateTool({
      inspect: async () => ({
        status: 'update_available',
        currentVersion: { branch: 'main', commit: 'abc1234', upstreamBranch: 'origin/main' },
        latestVersion: { branch: 'main', commit: 'def5678', upstreamBranch: 'origin/main' },
        summary: 'Update available: main@abc1234 -> main@def5678.',
      }),
      perform: async (inspection) => {
        performCalls += 1;
        assert.equal(inspection.status, 'update_available');
        return {
          previousVersion: inspection.currentVersion,
          currentVersion: inspection.latestVersion,
          summary: 'Update complete: main@abc1234 -> main@def5678.',
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
    assert.equal(result.summary, 'Update complete: main@abc1234 -> main@def5678.');
  });

  await t.test('blocked update', async () => {
    const tool = createSelfUpdateTool({
      inspect: async () => ({
        status: 'blocked',
        summary: 'Update blocked: working tree has uncommitted changes.',
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
      /Update blocked: working tree has uncommitted changes./,
    );
  });
});
