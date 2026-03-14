import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  LaunchdCronController,
  MemoryCronController,
  parseLaunchdPrintState,
  translateCronToLaunchd,
  type LaunchdAdapter,
} from './cron.ts';
import { RunRepository } from './persistence/run-repository.ts';
import type { BotConfig, TaskDefinition } from './domain.ts';

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

function createBotConfig(sqlitePath: string): BotConfig {
  return {
    botId: 'ops',
    workingDirectory: '/Users/example/.kfc',
    allowedUsers: ['operator-1'],
    server: {
      cardPath: '/bots/ops/webhook/card',
      eventPath: '/bots/ops/webhook/event',
    },
    storage: {
      sqlitePath,
    },
    feishu: {
      appId: 'ops-app',
      appSecret: 'ops-secret',
    },
    tasks: createCronTasks(),
    loadedAt: new Date().toISOString(),
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

test('parseLaunchdPrintState distinguishes running from not running', () => {
  assert.equal(parseLaunchdPrintState('state = running\n'), 'running');
  assert.equal(parseLaunchdPrintState('state = not running\nlast exit code = 127\n'), 'stopped');
  assert.equal(parseLaunchdPrintState('some unrelated output\n'), 'unknown');
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

test('repository stores cron chat subscriptions without duplicates and clears them globally', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-cron-subscriptions-'));
  const repository = new RunRepository(join(directory, 'cron.sqlite'));

  repository.upsertCronSubscription('cleanup', 'chat-a', 'actor-1');
  repository.upsertCronSubscription('cleanup', 'chat-a', 'actor-1');
  repository.upsertCronSubscription('cleanup', 'chat-b', 'actor-2');

  assert.equal(repository.isCronChatSubscribed('cleanup', 'chat-a'), true);
  assert.equal(repository.isCronChatSubscribed('cleanup', 'chat-c'), false);
  assert.deepEqual(
    repository.listCronSubscriptions('cleanup').map((subscription) => subscription.chatId),
    ['chat-a', 'chat-b'],
  );

  repository.clearCronSubscriptions('cleanup');
  assert.deepEqual(repository.listCronSubscriptions('cleanup'), []);

  repository.close();
});

test('launchd cron controller writes plist using absolute node entrypoint and avoids restart when already running', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-launchd-cron-'));
  const sqlitePath = join(directory, 'cron.sqlite');
  const repository = new RunRepository(sqlitePath);
  const calls: string[] = [];

  const launchd: LaunchdAdapter = {
    async status() {
      calls.push('status');
      return 'running';
    },
    async start() {
      calls.push('start');
    },
    async stop() {
      calls.push('stop');
    },
  };

  const controller = new LaunchdCronController(createBotConfig(sqlitePath), repository, {
    launchd,
  });

  const record = await controller.start('cleanup');
  assert.equal(record.observedState, 'running');
  assert.deepEqual(calls, ['status']);

  const plistPath = join(directory, 'launchd', 'com.kidsalfred.ops.cleanup.plist');
  const plistText = await import('node:fs/promises').then(({ readFile }) => readFile(plistPath, 'utf8'));
  assert.ok(plistText.includes(`<string>${process.execPath}</string>`));
  assert.ok(plistText.includes(`<string>${resolve(process.cwd(), 'src/kfc.ts')}</string>`));
  assert.ok(plistText.includes('<string>--experimental-strip-types</string>'));
  assert.ok(plistText.includes('<key>EnvironmentVariables</key>'));
  assert.ok(plistText.includes('<key>KIDS_ALFRED_CONFIG</key>'));
  assert.ok(!plistText.includes(`<string>${resolve(process.cwd(), 'kfc')}</string>`));

  repository.close();
});
