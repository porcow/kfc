import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryCronController, translateCronToLaunchd } from './cron.ts';
import { RunRepository } from './persistence/run-repository.ts';
import type { TaskDefinition } from './domain.ts';

function createCronTasks(): Record<string, TaskDefinition> {
  return {
    cleanup: {
      id: 'cleanup',
      runnerKind: 'external-command',
      executionMode: 'cronjob',
      description: 'Cleanup',
      command: '/bin/echo',
      args: ['cleanup'],
      timeoutMs: 5000,
      cancellable: false,
      parameters: {},
      cron: {
        schedule: '0 * * * *',
        autoStart: false,
      },
    },
  };
}

test('translateCronToLaunchd converts supported schedules', () => {
  assert.deepEqual(translateCronToLaunchd('0 * * * *'), { Minute: 0 });
  assert.deepEqual(translateCronToLaunchd('15 */6 * * *'), [
    { Minute: 15, Hour: 0 },
    { Minute: 15, Hour: 6 },
    { Minute: 15, Hour: 12 },
    { Minute: 15, Hour: 18 },
  ]);
  assert.throws(() => translateCronToLaunchd('0 0 * * 1'), /Unsupported cron schedule/);
});

test('memory cron controller persists desired and observed state separately from runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-cron-controller-'));
  const repository = new RunRepository(join(directory, 'cron.sqlite'));
  const controller = new MemoryCronController('ops', createCronTasks(), repository);

  await controller.reconcile();
  let [record] = await controller.list();
  assert.equal(record.taskId, 'cleanup');
  assert.equal(record.desiredState, 'stopped');
  assert.equal(record.observedState, 'stopped');

  record = await controller.start('cleanup');
  assert.equal(record.desiredState, 'started');
  assert.equal(record.observedState, 'running');
  assert.equal(repository.listRecentRuns().length, 0);

  record = await controller.stop('cleanup');
  assert.equal(record.desiredState, 'stopped');
  assert.equal(record.observedState, 'stopped');

  repository.close();
});
