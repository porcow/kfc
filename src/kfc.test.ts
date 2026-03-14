import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
        healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
        healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
        websocket: {
          alpha: {
            state: 'connected',
            consecutiveReconnectFailures: 0,
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
      confirmFullUninstall: async (prompt) => {
        calls.push(`confirm:${prompt}`);
        return true;
      },
      fullUninstaller: async () => {
        calls.push('uninstall');
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.ok(calls.some((entry) => entry.startsWith('confirm:')));
  assert.ok(calls.includes('uninstall'));
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
      confirmFullUninstall: async () => {
        calls.push('confirm');
        return false;
      },
      fullUninstaller: async () => {
        calls.push('uninstall');
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
      confirmFullUninstall: async () => {
        calls.push('confirm');
        return true;
      },
      fullUninstaller: async () => {
        calls.push('uninstall');
      },
      stdout: { write(value) { outputs.push(String(value)); } },
      stderr: { write(value) { errors.push(String(value)); } },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, ['uninstall']);
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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
      healthReader: async () => ({ ok: true, loadedAt: '', bots: [], websocket: {}, ready: true }),
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

    assert.deepEqual(calls, [
      `bootout gui/${process.getuid()} ${opsCronPlist}`,
      `bootout gui/${process.getuid()} ${supportCronPlist}`,
      `bootout gui/${process.getuid()}/com.kidsalfred.service`,
    ]);
    assert.deepEqual(removed, [opsCronPlist, supportCronPlist, servicePlistPath]);
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
