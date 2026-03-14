import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeConfiguredTask, runKfcCli } from './kfc.ts';
import { defaultConfigPath } from './config/paths.ts';

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
