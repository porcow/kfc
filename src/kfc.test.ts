import test from 'node:test';
import assert from 'node:assert/strict';

import { runKfcCli } from './kfc.ts';

test('kfc CLI delegates service lifecycle commands', async () => {
  const calls: string[] = [];

  const exitCode = await runKfcCli(
    ['service', 'install', '--config', '/tmp/bot.toml'],
    {
      serviceManager: {
        async install(configPath) {
          calls.push(`install:${configPath}`);
        },
        async uninstall() {
          calls.push('uninstall');
        },
        async start() {
          calls.push('start');
        },
        async restart() {
          calls.push('restart');
        },
        async stop() {
          calls.push('stop');
        },
      },
      pairAuthorizer: async () => {
        throw new Error('unexpected pair');
      },
      taskExecutor: async () => {
        throw new Error('unexpected exec');
      },
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );

  assert.equal(exitCode, 0);
  await runKfcCli(
    ['service', 'uninstall'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {
          calls.push('uninstall');
        },
        async start() {
          calls.push('start');
        },
        async restart() {
          calls.push('restart');
        },
        async stop() {
          calls.push('stop');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );
  await runKfcCli(
    ['service', 'start'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {
          calls.push('uninstall');
        },
        async start() {
          calls.push('start');
        },
        async restart() {
          calls.push('restart');
        },
        async stop() {
          calls.push('stop');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );
  await runKfcCli(
    ['service', 'restart'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {
          calls.push('uninstall');
        },
        async start() {
          calls.push('start');
        },
        async restart() {
          calls.push('restart');
        },
        async stop() {
          calls.push('stop');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );
  await runKfcCli(
    ['service', 'stop'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {
          calls.push('uninstall');
        },
        async start() {
          calls.push('start');
        },
        async restart() {
          calls.push('restart');
        },
        async stop() {
          calls.push('stop');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );

  assert.deepEqual(calls, ['install:/tmp/bot.toml', 'uninstall', 'start', 'restart', 'stop']);
});

test('kfc CLI delegates pair and exec commands', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];

  const pairExit = await runKfcCli(
    ['pair', 'ops-ABC123'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async (pairCode) => {
        outputs.push(`pair:${pairCode}`);
        return { actorId: 'ou_1', changed: true };
      },
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  const execExit = await runKfcCli(
    ['exec', '--bot', 'ops', '--task', 'cleanup'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async (botId, taskId) => {
        outputs.push(`exec:${botId}:${taskId}`);
        return { summary: 'cleanup completed' };
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(pairExit, 0);
  assert.equal(execExit, 0);
  assert.ok(outputs.some((entry) => entry.includes('pair:ops-ABC123')));
  assert.ok(outputs.some((entry) => entry.includes('exec:ops:cleanup')));
  assert.ok(outputs.some((entry) => entry.includes('cleanup completed')));
  assert.deepEqual(errors, []);
});

test('kfc CLI reports clear errors for uninstalled service lifecycle operations', async () => {
  const errors: string[] = [];

  const startExit = await runKfcCli(
    ['service', 'start'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
        async restart() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
        async stop() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  const restartExit = await runKfcCli(
    ['service', 'restart'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
        async restart() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
        async stop() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  const stopExit = await runKfcCli(
    ['service', 'stop'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
        async restart() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
        async stop() {
          throw new Error('Service is not installed. Run: kfc service install --config /path/to/bot.toml');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      stdout: { write() {} },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(startExit, 1);
  assert.equal(restartExit, 1);
  assert.equal(stopExit, 1);
  assert.equal(errors.length, 3);
  assert.ok(errors.every((entry) => entry.includes('Service is not installed. Run: kfc service install --config /path/to/bot.toml')));
});
