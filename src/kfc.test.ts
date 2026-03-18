import { test } from './test-compat.ts';
import assert from 'node:assert/strict';

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LaunchdServiceManager,
  executeConfiguredTask,
  runKfcCli,
} from './kfc.ts';
import { defaultConfigPath } from './config/paths.ts';
import { buildLaunchdLabel, cronLaunchdPlistPath } from './cron.ts';

test('defaultConfigPath falls back to ~/.config/kfc/config.toml', () => {
  const previousConfig = process.env.KIDS_ALFRED_CONFIG;
  const previousHome = process.env.HOME;
  delete process.env.KIDS_ALFRED_CONFIG;
  process.env.HOME = '/Users/example';

  try {
    assert.equal(defaultConfigPath(), '/Users/example/.config/kfc/config.toml');
  } finally {
    if (previousConfig === undefined) {
      delete process.env.KIDS_ALFRED_CONFIG;
    } else {
      process.env.KIDS_ALFRED_CONFIG = previousConfig;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

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
      healthReader: async () => {
        throw new Error('unexpected health');
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );

  assert.deepEqual(calls, ['install:/tmp/bot.toml', 'uninstall', 'start', 'restart', 'stop']);
});

test('kfc service install falls back to the default config path when --config is omitted', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const previousHome = process.env.HOME;
  const previousConfig = process.env.KIDS_ALFRED_CONFIG;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-install-default-'));
  process.env.HOME = directory;
  delete process.env.KIDS_ALFRED_CONFIG;
  await mkdir(join(directory, '.config', 'kfc'), { recursive: true });
  await writeFile(join(directory, '.config', 'kfc', 'config.toml'), '[server]\nport = 3000\n');

  const calls: string[] = [];
  try {
    const exitCode = await runKfcCli(
      ['service', 'install'],
      {
        serviceManager: {
          async install(configPath) {
            calls.push(configPath);
          },
          async uninstall() {},
          async start() {},
          async restart() {},
          async stop() {},
        },
        pairAuthorizer: async () => ({ actorId: '', changed: false }),
        taskExecutor: async () => ({ summary: 'ok' }),
        healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
        stdout: { write(value) { outputs.push(String(value)); } },
        stderr: { write(value) { errors.push(String(value)); } },
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [join(directory, '.config', 'kfc', 'config.toml')]);
    assert.ok(outputs.some((entry) => entry.includes('Service installed')));
    assert.deepEqual(errors, []);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousConfig === undefined) {
      delete process.env.KIDS_ALFRED_CONFIG;
    } else {
      process.env.KIDS_ALFRED_CONFIG = previousConfig;
    }
  }
});

test('kfc update prints already-latest status without confirmation', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  let confirmCalls = 0;

  const exitCode = await runKfcCli(
    ['update'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      updateInspector: async () => ({
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
      updatePerformer: async () => {
        throw new Error('unexpected perform');
      },
      confirmUpdate: async () => {
        confirmCalls += 1;
        return true;
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(confirmCalls, 0);
  assert.deepEqual(errors, []);
  assert.ok(outputs.some((entry) => entry.includes('Already at v0.2.0.')));
});

test('kfc update prompts before performing an available update', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const prompts: string[] = [];
  let performCalls = 0;

  const exitCode = await runKfcCli(
    ['update'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      updateInspector: async () => ({
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
      updatePerformer: async () => {
        performCalls += 1;
        return {
          previousVersion: {
            repo: 'porcow/kfc',
            version: 'v0.1.0',
            channel: 'stable',
            publishedAt: '2026-03-16T00:00:00Z',
            assetName: 'kfc-v0.1.0.tar.gz',
          },
          currentVersion: {
            repo: 'porcow/kfc',
            version: 'v0.2.0',
            channel: 'stable',
            publishedAt: '2026-03-16T00:00:00Z',
            assetName: 'kfc-v0.2.0.tar.gz',
          },
          summary: 'Update complete. Current version: v0.2.0.',
        };
      },
      confirmUpdate: async (prompt) => {
        prompts.push(prompt);
        return true;
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(performCalls, 1);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Continue with update\? \[y\/N\]/);
  assert.deepEqual(errors, []);
  assert.ok(outputs.some((entry) => entry.includes('Update complete. Current version: v0.2.0.')));
});

test('kfc update supports --yes and skips confirmation', async () => {
  let confirmCalls = 0;
  let performCalls = 0;

  const exitCode = await runKfcCli(
    ['update', '--yes'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      updateInspector: async () => ({
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
      updatePerformer: async () => {
        performCalls += 1;
        return {
          previousVersion: {
            repo: 'porcow/kfc',
            version: 'v0.1.0',
            channel: 'stable',
            publishedAt: '2026-03-16T00:00:00Z',
            assetName: 'kfc-v0.1.0.tar.gz',
          },
          currentVersion: {
            repo: 'porcow/kfc',
            version: 'v0.2.0',
            channel: 'stable',
            publishedAt: '2026-03-16T00:00:00Z',
            assetName: 'kfc-v0.2.0.tar.gz',
          },
          summary: 'Update complete. Current version: v0.2.0.',
        };
      },
      confirmUpdate: async () => {
        confirmCalls += 1;
        return true;
      },
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(confirmCalls, 0);
  assert.equal(performCalls, 1);
});

test('kfc update exits cleanly when the user declines confirmation and surfaces blocked states', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  let performCalls = 0;

  const declinedExitCode = await runKfcCli(
    ['update'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      updateInspector: async () => ({
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
      updatePerformer: async () => {
        performCalls += 1;
        throw new Error('unexpected perform');
      },
      confirmUpdate: async () => false,
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(declinedExitCode, 0);
  assert.equal(performCalls, 0);
  assert.ok(outputs.some((entry) => entry.includes('Update cancelled')));
  assert.deepEqual(errors, []);

  const blockedErrors: string[] = [];
  const blockedExitCode = await runKfcCli(
    ['update'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      updateInspector: async () => ({
        status: 'blocked',
        summary: 'Update blocked: install metadata is unusable.',
      }),
      updatePerformer: async () => {
        throw new Error('unexpected perform');
      },
      confirmUpdate: async () => true,
      stdout: { write() {} },
      stderr: { write(value) { blockedErrors.push(String(value)); } },
    },
  );

  assert.equal(blockedExitCode, 1);
  assert.ok(blockedErrors.some((entry) => entry.includes('Update blocked: install metadata is unusable.')));
});

test('kfc rollback prompts before performing an available rollback and supports --yes', async () => {
  const prompts: string[] = [];
  let confirmCalls = 0;
  let performCalls = 0;

  const interactiveExitCode = await runKfcCli(
    ['rollback'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      rollbackInspector: async () => ({
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
      }),
      rollbackPerformer: async () => {
        performCalls += 1;
        return {
          previousVersion: {
            repo: 'porcow/kfc',
            version: 'v0.2.0',
            channel: 'stable',
            publishedAt: '2026-03-16T01:00:00Z',
            assetName: 'kfc-v0.2.0.tar.gz',
          },
          currentVersion: {
            repo: 'porcow/kfc',
            version: 'v0.1.0',
            channel: 'stable',
            publishedAt: '2026-03-10T09:00:00Z',
            assetName: 'kfc-v0.1.0.tar.gz',
          },
          summary: 'Rollback complete. Current version: v0.1.0.',
        };
      },
      confirmRollback: async (prompt) => {
        confirmCalls += 1;
        prompts.push(prompt);
        return true;
      },
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );

  assert.equal(interactiveExitCode, 0);
  assert.equal(confirmCalls, 1);
  assert.equal(performCalls, 1);
  assert.match(prompts[0], /Continue with rollback\? \[y\/N\]/);

  confirmCalls = 0;
  const yesExitCode = await runKfcCli(
    ['rollback', '--yes'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      rollbackInspector: async () => ({
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
      }),
      rollbackPerformer: async () => ({
        previousVersion: {
          repo: 'porcow/kfc',
          version: 'v0.2.0',
          channel: 'stable',
          publishedAt: '2026-03-16T01:00:00Z',
          assetName: 'kfc-v0.2.0.tar.gz',
        },
        currentVersion: {
          repo: 'porcow/kfc',
          version: 'v0.1.0',
          channel: 'stable',
          publishedAt: '2026-03-10T09:00:00Z',
          assetName: 'kfc-v0.1.0.tar.gz',
        },
        summary: 'Rollback complete. Current version: v0.1.0.',
      }),
      confirmRollback: async () => {
        confirmCalls += 1;
        return true;
      },
      stdout: { write() {} },
      stderr: { write() {} },
    },
  );

  assert.equal(yesExitCode, 0);
  assert.equal(confirmCalls, 0);
});

test('kfc service install writes a plist that does not depend on cwd', { concurrency: false }, async () => {
  const previousHome = process.env.HOME;
  const previousConfig = process.env.KIDS_ALFRED_CONFIG;
  const previousBunBin = process.env.KFC_BUN_BIN;
  const previousCwd = process.cwd();
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-install-cwd-'));
  const unrelatedDirectory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-cwd-unrelated-'));
  process.env.HOME = directory;
  process.env.KFC_BUN_BIN = '/tmp/test-bun';
  delete process.env.KIDS_ALFRED_CONFIG;
  await mkdir(join(directory, 'Library', 'LaunchAgents'), { recursive: true });
  const calls: string[] = [];

  try {
    process.chdir(unrelatedDirectory);
    const manager = new LaunchdServiceManager({
      execFileAsync: async (_file, args) => {
        calls.push(args.join(' '));
        return { stdout: '', stderr: '' };
      },
    });

    await manager.install('/tmp/bot.toml');

    const plistPath = join(directory, 'Library', 'LaunchAgents', 'com.kidsalfred.service.plist');
    const plist = await readFile(plistPath, 'utf8');
    assert.ok(plist.includes('<string>/tmp/test-bun</string>'));
    assert.ok(plist.includes(`<string>${join(projectRoot, 'src', 'index.ts')}</string>`));
    assert.ok(!plist.includes(`<string>${join(unrelatedDirectory, 'src', 'index.ts')}</string>`));
    assert.ok(!plist.includes('--experimental-strip-types'));
    assert.deepEqual(calls, [
      `bootout gui/${process.getuid()} ${plistPath}`,
      `bootstrap gui/${process.getuid()} ${plistPath}`,
      `kickstart -k gui/${process.getuid()}/com.kidsalfred.service`,
    ]);
  } finally {
    process.chdir(previousCwd);
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousConfig === undefined) {
      delete process.env.KIDS_ALFRED_CONFIG;
    } else {
      process.env.KIDS_ALFRED_CONFIG = previousConfig;
    }
    if (previousBunBin === undefined) {
      delete process.env.KFC_BUN_BIN;
    } else {
      process.env.KFC_BUN_BIN = previousBunBin;
    }
  }
});

test('kfc service install without --config returns a clear error when the default config file is missing', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const previousHome = process.env.HOME;
  const previousConfig = process.env.KIDS_ALFRED_CONFIG;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-install-missing-'));
  process.env.HOME = directory;
  delete process.env.KIDS_ALFRED_CONFIG;

  const calls: string[] = [];
  try {
    const exitCode = await runKfcCli(
      ['service', 'install'],
      {
        serviceManager: {
          async install(configPath) {
            calls.push(configPath);
          },
          async uninstall() {},
          async start() {},
          async restart() {},
          async stop() {},
        },
        pairAuthorizer: async () => ({ actorId: '', changed: false }),
        taskExecutor: async () => ({ summary: 'ok' }),
        healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
        stdout: { write(value) { outputs.push(String(value)); } },
        stderr: { write(value) { errors.push(String(value)); } },
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(outputs, []);
    assert.ok(errors.some((entry) => entry.includes(join(directory, '.config', 'kfc', 'config.toml'))));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousConfig === undefined) {
      delete process.env.KIDS_ALFRED_CONFIG;
    } else {
      process.env.KIDS_ALFRED_CONFIG = previousConfig;
    }
  }
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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

test('kfc health prints the canonical health snapshot', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];

  const exitCode = await runKfcCli(
    ['health'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({
        ok: true,
        loadedAt: '2026-03-14T08:30:00.000Z',
        bots: ['alpha'],
        botHealth: {
          alpha: {
            websocket: {
              state: 'connected',
              consecutiveReconnectFailures: 0,
            },
            availability: {
              ingressAvailable: true,
              activeIngress: 'websocket',
              summary: 'Available via WebSocket',
            },
          },
        },
        ready: true,
      }),
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.ok(outputs.join('').includes('"bots": [\n    "alpha"\n  ]'));
  assert.ok(outputs.join('').includes('"ready": true'));
});

test('kfc health returns a clear error when the local health endpoint is unreachable', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];

  const exitCode = await runKfcCli(
    ['health'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => {
        throw new Error('Unable to reach local health endpoint at http://127.0.0.1:3000/health: connect ECONNREFUSED');
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(outputs, []);
  assert.ok(errors.some((entry) => entry.includes('Unable to reach local health endpoint')));
});

test('kfc version prints the current version label', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];

  const exitCode = await runKfcCli(
    ['version'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      versionReader: async () => 'v0.1.3',
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.equal(outputs.join(''), 'v0.1.3\n');
});

test('kfc uninstall runs full uninstall after interactive confirmation', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];

  const exitCode = await runKfcCli(
    ['uninstall'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      confirmFullUninstall: async (prompt) => {
        calls.push(`confirm:${prompt}`);
        return true;
      },
      fullUninstaller: async (deleteConfig) => {
        calls.push(`uninstall:${deleteConfig}`);
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.ok(calls.some((entry) => entry.includes('default config will be preserved')));
  assert.ok(calls.includes('uninstall:false'));
  assert.ok(outputs.some((entry) => entry.includes('Uninstalled kfc')));
});

test('kfc uninstall aborts cleanly when confirmation is declined', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];

  const exitCode = await runKfcCli(
    ['uninstall'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      confirmFullUninstall: async () => {
        calls.push('confirm');
        return false;
      },
      fullUninstaller: async (deleteConfig) => {
        calls.push(`uninstall:${deleteConfig}`);
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, ['confirm']);
  assert.ok(outputs.some((entry) => entry.includes('Uninstall cancelled')));
});

test('kfc uninstall --yes skips confirmation and uninstalls immediately', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];

  const exitCode = await runKfcCli(
    ['uninstall', '--yes'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      confirmFullUninstall: async () => {
        calls.push('confirm');
        return true;
      },
      fullUninstaller: async (deleteConfig) => {
        calls.push(`uninstall:${deleteConfig}`);
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, ['uninstall:false']);
  assert.ok(outputs.some((entry) => entry.includes('Uninstalled kfc')));
});

test('kfc uninstall --delete-config updates prompt and deletes config when confirmed', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];

  const exitCode = await runKfcCli(
    ['uninstall', '--delete-config'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      confirmFullUninstall: async (prompt) => {
        calls.push(`confirm:${prompt}`);
        return true;
      },
      fullUninstaller: async (deleteConfig) => {
        calls.push(`uninstall:${deleteConfig}`);
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.ok(calls.some((entry) => entry.includes('the default config file')));
  assert.ok(calls.includes('uninstall:true'));
  assert.ok(outputs.some((entry) => entry.includes('Uninstalled kfc')));
});

test('kfc uninstall --yes --delete-config skips confirmation and deletes config', async () => {
  const outputs: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];

  const exitCode = await runKfcCli(
    ['uninstall', '--yes', '--delete-config'],
    {
      serviceManager: {
        async install() {},
        async uninstall() {},
        async start() {},
        async restart() {},
        async stop() {},
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      confirmFullUninstall: async () => {
        calls.push('confirm');
        return true;
      },
      fullUninstaller: async (deleteConfig) => {
        calls.push(`uninstall:${deleteConfig}`);
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, ['uninstall:true']);
  assert.ok(outputs.some((entry) => entry.includes('Uninstalled kfc')));
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
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
        async restart() {
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
        async stop() {
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
        async restart() {
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
        async stop() {
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
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
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
        async restart() {
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
        async stop() {
          throw new Error('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]');
        },
      },
      pairAuthorizer: async () => ({ actorId: '', changed: false }),
      taskExecutor: async () => ({ summary: 'ok' }),
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], botHealth: {}, ready: true }),
      stdout: { write() {} },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(startExit, 1);
  assert.equal(restartExit, 1);
  assert.equal(stopExit, 1);
  assert.equal(errors.length, 3);
  assert.ok(errors.every((entry) => entry.includes('Service is not installed. Run: kfc service install [--config /path/to/bot.toml]')));
});

test('service uninstall unloads configured cronjobs before removing the main service plist', async () => {
  const previousHome = process.env.HOME;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-uninstall-'));
  process.env.HOME = directory;

  const configPath = join(directory, 'config.toml');
  const opsSqlitePath = join(directory, '.kfc', 'data', 'ops.sqlite');
  const supportSqlitePath = join(directory, '.kfc', 'data', 'support.sqlite');
  const servicePlistPath = join(directory, 'Library', 'LaunchAgents', 'com.kidsalfred.service.plist');
  const opsCronPlist = cronLaunchdPlistPath(opsSqlitePath, 'ops', 'check-pd');
  const supportCronPlist = cronLaunchdPlistPath(supportSqlitePath, 'support', 'sync-cache');

  await mkdir(join(directory, 'Library', 'LaunchAgents'), { recursive: true });
  await mkdir(join(directory, '.kfc', 'data', 'launchd'), { recursive: true });
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.ops]
allowed_users = ["ou_ops"]

[bots.ops.server]
card_path = "/bots/ops/webhook/card"
event_path = "/bots/ops/webhook/event"

[bots.ops.storage]
sqlite_path = "${opsSqlitePath}"

[bots.ops.feishu]
app_id = "ops-app"
app_secret = "ops-secret"

[bots.ops.tasks.check-pd]
runner_kind = "builtin-tool"
execution_mode = "cronjob"
description = "Check Windows"
tool = "checkPDWin11"
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.check-pd.cron]
schedule = "*/5 * * * *"
auto_start = true

[bots.ops.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Echo"
tool = "echo"
timeout_ms = 5000
cancellable = false

[bots.support]
allowed_users = ["ou_support"]

[bots.support.server]
card_path = "/bots/support/webhook/card"
event_path = "/bots/support/webhook/event"

[bots.support.storage]
sqlite_path = "${supportSqlitePath}"

[bots.support.feishu]
app_id = "support-app"
app_secret = "support-secret"

[bots.support.tasks.sync-cache]
runner_kind = "external-command"
execution_mode = "cronjob"
description = "Sync cache"
command = "/bin/echo"
args = ["sync"]
timeout_ms = 5000
cancellable = false

[bots.support.tasks.sync-cache.cron]
schedule = "0 * * * *"
auto_start = false
`,
  );
  await writeFile(
    servicePlistPath,
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>EnvironmentVariables</key><dict><key>KIDS_ALFRED_CONFIG</key><string>${configPath}</string></dict></dict></plist>`,
  );
  await mkdir(join(directory, '.kfc', 'data', 'launchd'), { recursive: true });
  await writeFile(opsCronPlist, 'ops', 'utf8');
  await writeFile(supportCronPlist, 'support', 'utf8');

  const calls: string[] = [];
  const removed: string[] = [];
  try {
    const manager = new LaunchdServiceManager({
      execFileAsync: async (_file, args) => {
        calls.push(args.join(' '));
        return { stdout: '', stderr: '' };
      },
      unlink: async (path) => {
        removed.push(path);
      },
    });

    await manager.uninstall();

    assert.deepEqual([...calls].sort(), [
      `bootout gui/${process.getuid()} ${opsCronPlist}`,
      `bootout gui/${process.getuid()} ${supportCronPlist}`,
      `bootout gui/${process.getuid()}/com.kidsalfred.service`,
    ].sort());
    assert.deepEqual([...removed].sort(), [opsCronPlist, supportCronPlist, servicePlistPath].sort());
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('service uninstall continues across cronjob cleanup failures and surfaces them', async () => {
  const previousHome = process.env.HOME;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-uninstall-fail-'));
  process.env.HOME = directory;

  const configPath = join(directory, 'config.toml');
  const opsSqlitePath = join(directory, '.kfc', 'data', 'ops.sqlite');
  const supportSqlitePath = join(directory, '.kfc', 'data', 'support.sqlite');
  const servicePlistPath = join(directory, 'Library', 'LaunchAgents', 'com.kidsalfred.service.plist');
  const opsCronPlist = cronLaunchdPlistPath(opsSqlitePath, 'ops', 'check-pd');
  const supportCronPlist = cronLaunchdPlistPath(supportSqlitePath, 'support', 'sync-cache');

  await mkdir(join(directory, 'Library', 'LaunchAgents'), { recursive: true });
  await mkdir(join(directory, '.kfc', 'data', 'launchd'), { recursive: true });
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.ops]
allowed_users = ["ou_ops"]

[bots.ops.server]
card_path = "/bots/ops/webhook/card"
event_path = "/bots/ops/webhook/event"

[bots.ops.storage]
sqlite_path = "${opsSqlitePath}"

[bots.ops.feishu]
app_id = "ops-app"
app_secret = "ops-secret"

[bots.ops.tasks.check-pd]
runner_kind = "builtin-tool"
execution_mode = "cronjob"
description = "Check Windows"
tool = "checkPDWin11"
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.check-pd.cron]
schedule = "*/5 * * * *"
auto_start = true

[bots.support]
allowed_users = ["ou_support"]

[bots.support.server]
card_path = "/bots/support/webhook/card"
event_path = "/bots/support/webhook/event"

[bots.support.storage]
sqlite_path = "${supportSqlitePath}"

[bots.support.feishu]
app_id = "support-app"
app_secret = "support-secret"

[bots.support.tasks.sync-cache]
runner_kind = "external-command"
execution_mode = "cronjob"
description = "Sync cache"
command = "/bin/echo"
args = ["sync"]
timeout_ms = 5000
cancellable = false

[bots.support.tasks.sync-cache.cron]
schedule = "0 * * * *"
auto_start = false
`,
  );
  await writeFile(
    servicePlistPath,
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>EnvironmentVariables</key><dict><key>KIDS_ALFRED_CONFIG</key><string>${configPath}</string></dict></dict></plist>`,
  );
  await writeFile(opsCronPlist, 'ops', 'utf8');
  await writeFile(supportCronPlist, 'support', 'utf8');

  const calls: string[] = [];
  const removed: string[] = [];
  try {
    const manager = new LaunchdServiceManager({
      execFileAsync: async (_file, args) => {
        calls.push(args.join(' '));
        if (args[2] === opsCronPlist) {
          throw new Error('bootout failed');
        }
        return { stdout: '', stderr: '' };
      },
      unlink: async (path) => {
        removed.push(path);
      },
    });

    await assert.rejects(
      manager.uninstall(),
      /Failed to unload cronjob com\.kidsalfred\.ops\.check-pd: bootout failed/,
    );

    assert.deepEqual(calls, [
      `bootout gui/${process.getuid()} ${opsCronPlist}`,
      `bootout gui/${process.getuid()} ${supportCronPlist}`,
      `bootout gui/${process.getuid()}/com.kidsalfred.service`,
    ]);
    assert.deepEqual(removed, [opsCronPlist, supportCronPlist, servicePlistPath]);
    assert.ok(calls.includes(`bootout gui/${process.getuid()} ${supportCronPlist}`));
    assert.ok(calls.includes(`bootout gui/${process.getuid()}/com.kidsalfred.service`));
    assert.ok(removed.includes(supportCronPlist));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('service uninstall falls back to scanning cron plists when the main service plist is missing', async () => {
  const previousHome = process.env.HOME;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-uninstall-fallback-missing-'));
  process.env.HOME = directory;

  const opsSqlitePath = join(directory, '.kfc', 'data', 'ops.sqlite');
  const supportSqlitePath = join(directory, '.kfc', 'nested', 'data', 'support.sqlite');
  const servicePlistPath = join(directory, 'Library', 'LaunchAgents', 'com.kidsalfred.service.plist');
  const opsCronPlist = cronLaunchdPlistPath(opsSqlitePath, 'ops', 'check-pd');
  const supportCronPlist = cronLaunchdPlistPath(supportSqlitePath, 'support', 'sync-cache');

  await mkdir(join(directory, '.kfc', 'data', 'launchd'), { recursive: true });
  await mkdir(join(directory, '.kfc', 'nested', 'data', 'launchd'), { recursive: true });
  await writeFile(opsCronPlist, 'ops', 'utf8');
  await writeFile(supportCronPlist, 'support', 'utf8');

  const calls: string[] = [];
  const removed: string[] = [];
  try {
    const manager = new LaunchdServiceManager({
      execFileAsync: async (_file, args) => {
        calls.push(args.join(' '));
        return { stdout: '', stderr: '' };
      },
      unlink: async (path) => {
        removed.push(path);
      },
    });

    await manager.uninstall();

    assert.deepEqual([...calls].sort(), [
      `bootout gui/${process.getuid()} ${opsCronPlist}`,
      `bootout gui/${process.getuid()} ${supportCronPlist}`,
      `bootout gui/${process.getuid()}/com.kidsalfred.service`,
    ].sort());
    assert.deepEqual([...removed].sort(), [opsCronPlist, supportCronPlist, servicePlistPath].sort());
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('service uninstall falls back to scanning cron plists when installed config cannot be loaded', async () => {
  const previousHome = process.env.HOME;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-uninstall-fallback-config-'));
  process.env.HOME = directory;

  const missingConfigPath = join(directory, 'missing.toml');
  const servicePlistPath = join(directory, 'Library', 'LaunchAgents', 'com.kidsalfred.service.plist');
  const opsSqlitePath = join(directory, '.kfc', 'data', 'ops.sqlite');
  const opsCronPlist = cronLaunchdPlistPath(opsSqlitePath, 'ops', 'check-pd');

  await mkdir(join(directory, 'Library', 'LaunchAgents'), { recursive: true });
  await mkdir(join(directory, '.kfc', 'data', 'launchd'), { recursive: true });
  await writeFile(
    servicePlistPath,
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>EnvironmentVariables</key><dict><key>KIDS_ALFRED_CONFIG</key><string>${missingConfigPath}</string></dict></dict></plist>`,
  );
  await writeFile(opsCronPlist, 'ops', 'utf8');

  const calls: string[] = [];
  const removed: string[] = [];
  try {
    const manager = new LaunchdServiceManager({
      execFileAsync: async (_file, args) => {
        calls.push(args.join(' '));
        return { stdout: '', stderr: '' };
      },
      unlink: async (path) => {
        removed.push(path);
      },
    });

    await manager.uninstall();

    assert.deepEqual(calls, [
      `bootout gui/${process.getuid()} ${opsCronPlist}`,
      `bootout gui/${process.getuid()}/com.kidsalfred.service`,
    ]);
    assert.deepEqual(removed, [opsCronPlist, servicePlistPath]);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('service install removes cronjobs deleted from the previously installed config before refreshing the main service', async () => {
  const previousHome = process.env.HOME;
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-install-cleanup-'));
  process.env.HOME = directory;

  const oldConfigPath = join(directory, 'old-config.toml');
  const newConfigPath = join(directory, 'new-config.toml');
  const servicePlist = join(directory, 'Library', 'LaunchAgents', 'com.kidsalfred.service.plist');
  const oldSqlitePath = join(directory, '.kfc', 'data', 'ops.sqlite');
  const sharedSqlitePath = join(directory, '.kfc', 'data', 'shared.sqlite');
  const deletedCronPlist = cronLaunchdPlistPath(oldSqlitePath, 'ops', 'old-task');
  const retainedCronPlist = cronLaunchdPlistPath(sharedSqlitePath, 'ops', 'keep-task');

  await mkdir(join(directory, 'Library', 'LaunchAgents'), { recursive: true });
  await mkdir(join(directory, '.kfc', 'data', 'launchd'), { recursive: true });
  await writeFile(
    oldConfigPath,
    `
[server]
port = 3100

[bots.ops]
allowed_users = ["ou_ops"]

[bots.ops.server]
card_path = "/bots/ops/webhook/card"
event_path = "/bots/ops/webhook/event"

[bots.ops.storage]
sqlite_path = "${sharedSqlitePath}"

[bots.ops.feishu]
app_id = "ops-app"
app_secret = "ops-secret"

[bots.ops.tasks.old-task]
runner_kind = "builtin-tool"
execution_mode = "cronjob"
description = "Old task"
tool = "checkPDWin11"
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.old-task.cron]
schedule = "*/5 * * * *"
auto_start = true

[bots.ops.tasks.keep-task]
runner_kind = "external-command"
execution_mode = "cronjob"
description = "Keep task"
command = "/bin/echo"
args = ["keep"]
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.keep-task.cron]
schedule = "0 * * * *"
auto_start = true
`,
  );
  await writeFile(
    newConfigPath,
    `
[server]
port = 3100

[bots.ops]
allowed_users = ["ou_ops"]

[bots.ops.server]
card_path = "/bots/ops/webhook/card"
event_path = "/bots/ops/webhook/event"

[bots.ops.storage]
sqlite_path = "${sharedSqlitePath}"

[bots.ops.feishu]
app_id = "ops-app"
app_secret = "ops-secret"

[bots.ops.tasks.keep-task]
runner_kind = "external-command"
execution_mode = "cronjob"
description = "Keep task"
command = "/bin/echo"
args = ["keep"]
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.keep-task.cron]
schedule = "0 * * * *"
auto_start = true
`,
  );
  await writeFile(
    servicePlist,
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>EnvironmentVariables</key><dict><key>KIDS_ALFRED_CONFIG</key><string>${oldConfigPath}</string></dict></dict></plist>`,
  );
  await writeFile(deletedCronPlist, 'old', 'utf8');
  await writeFile(retainedCronPlist, 'keep', 'utf8');

  const calls: string[] = [];
  const removed: string[] = [];
  try {
    const manager = new LaunchdServiceManager({
      execFileAsync: async (_file, args) => {
        calls.push(args.join(' '));
        return { stdout: '', stderr: '' };
      },
      unlink: async (path) => {
        removed.push(path);
      },
    });

    await manager.install(newConfigPath);

    assert.ok(calls.includes(`bootout gui/${process.getuid()} ${deletedCronPlist}`));
    assert.ok(!calls.includes(`bootout gui/${process.getuid()} ${retainedCronPlist}`));
    assert.ok(calls.includes(`bootout gui/${process.getuid()} ${servicePlist}`));
    assert.ok(calls.includes(`bootstrap gui/${process.getuid()} ${servicePlist}`));
    assert.ok(calls.includes(`kickstart -k gui/${process.getuid()}/com.kidsalfred.service`));
    assert.deepEqual(removed, [deletedCronPlist]);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('executeConfiguredTask fans out bot-scoped notification intents to subscribed chats', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-pd-'));
  const configPath = join(directory, 'bot.toml');
  const sqlitePath = join(directory, 'ops.sqlite');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.ops]
allowed_users = ["local-admin"]

[bots.ops.server]
card_path = "/bots/ops/webhook/card"
event_path = "/bots/ops/webhook/event"

[bots.ops.storage]
sqlite_path = "${sqlitePath}"

[bots.ops.feishu]
app_id = "ops-app"
app_secret = "ops-secret"

[bots.ops.tasks.check-pd]
runner_kind = "builtin-tool"
execution_mode = "cronjob"
description = "Check Windows 11"
tool = "fake-check-pd"
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.check-pd.cron]
schedule = "*/5 * * * *"
auto_start = true
`,
  );

  const { RunRepository } = await import('./persistence/run-repository.ts');
  const repository = new RunRepository(sqlitePath);
  repository.upsertCronSubscription('check-pd', 'oc_chat_a', 'operator-a');
  repository.upsertCronSubscription('check-pd', 'oc_chat_b', 'operator-b');
  repository.close();

  const deliveries: string[] = [];
  const result = await executeConfiguredTask(configPath, 'ops', 'check-pd', {
    builtinTools: new Map([
      [
        'fake-check-pd',
        {
          id: 'fake-check-pd',
          async execute() {
            return {
              summary: 'observed transition',
              notifications: [
                {
                  channel: 'feishu',
                  title: 'MC 启动!',
                  body: 'Windows 11 start time: 2026/03/13 08:00:00',
                },
              ],
            };
          },
        },
      ],
    ]),
    sendFeishuNotification: async (bot, notification) => {
      deliveries.push(`${bot.botId}:${notification.chatId}:${notification.title}:${notification.body}`);
    },
  });

  assert.equal(result.summary, 'observed transition');
  assert.deepEqual(deliveries, [
    'ops:oc_chat_a:MC 启动!:Windows 11 start time: 2026/03/13 08:00:00',
    'ops:oc_chat_b:MC 启动!:Windows 11 start time: 2026/03/13 08:00:00',
  ]);
});

test('executeConfiguredTask tolerates partial fan-out delivery failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-kfc-pd-failure-'));
  const configPath = join(directory, 'bot.toml');
  const sqlitePath = join(directory, 'ops.sqlite');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.ops]
allowed_users = ["local-admin"]

[bots.ops.server]
card_path = "/bots/ops/webhook/card"
event_path = "/bots/ops/webhook/event"

[bots.ops.storage]
sqlite_path = "${sqlitePath}"

[bots.ops.feishu]
app_id = "ops-app"
app_secret = "ops-secret"

[bots.ops.tasks.check-pd]
runner_kind = "builtin-tool"
execution_mode = "cronjob"
description = "Check Windows 11"
tool = "fake-check-pd"
timeout_ms = 5000
cancellable = false

[bots.ops.tasks.check-pd.cron]
schedule = "*/5 * * * *"
auto_start = true
`,
  );

  const { RunRepository } = await import('./persistence/run-repository.ts');
  const repository = new RunRepository(sqlitePath);
  repository.upsertCronSubscription('check-pd', 'oc_chat_a', 'operator-a');
  repository.upsertCronSubscription('check-pd', 'oc_chat_b', 'operator-b');
  repository.close();

  const deliveries: string[] = [];
  const originalConsoleError = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const result = await executeConfiguredTask(configPath, 'ops', 'check-pd', {
      builtinTools: new Map([
        [
          'fake-check-pd',
          {
            id: 'fake-check-pd',
            async execute() {
              return {
                summary: 'observed transition',
                notifications: [
                  {
                    channel: 'feishu',
                    title: 'MC 下线!',
                    body: 'Windows 11 shutdown time: 2026/03/13 08:20:00',
                  },
                ],
              };
            },
          },
        ],
      ]),
      sendFeishuNotification: async (bot, notification) => {
        if (notification.chatId === 'oc_chat_a') {
          throw new Error('delivery blocked');
        }
        deliveries.push(`${bot.botId}:${notification.chatId}:${notification.title}:${notification.body}`);
      },
    });

    assert.equal(result.summary, 'observed transition');
    assert.deepEqual(deliveries, [
      'ops:oc_chat_b:MC 下线!:Windows 11 shutdown time: 2026/03/13 08:20:00',
    ]);
    assert.ok(errors.some((entry) => entry.includes('cron_notification_delivery_failed')));
    assert.ok(errors.some((entry) => entry.includes('oc_chat_a')));
  } finally {
    console.error = originalConsoleError;
  }
});
