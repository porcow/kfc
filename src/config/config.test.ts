import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, validateParameters } from './schema.ts';

const sampleConfig = `
[server]
port = 3100
health_path = "/health"

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.storage]
sqlite_path = "./data/alpha.sqlite"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"
verification_token = "alpha-token"
encrypt_key = "alpha-encrypt"

[bots.alpha.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin echo"
tool = "echo"
timeout_ms = 5000
cancellable = true

[bots.alpha.tasks.echo.parameters.message]
type = "string"
required = true

[bots.beta]
allowed_users = ["user-2"]

[bots.beta.server]
card_path = "/bots/beta/webhook/card"
event_path = "/bots/beta/webhook/event"

[bots.beta.storage]
sqlite_path = "./data/beta.sqlite"

[bots.beta.feishu]
app_id = "beta-app"
app_secret = "beta-secret"
verification_token = "beta-token"
encrypt_key = "beta-encrypt"

[bots.beta.tasks.say]
runner_kind = "external-command"
execution_mode = "oneshot"
description = "Say hello"
command = "/bin/echo"
args = ["hello", "{{name}}"]
timeout_ms = 5000
cancellable = false

[bots.beta.tasks.say.parameters.name]
type = "string"
required = true

[bots.beta.tasks.cleanup]
runner_kind = "external-command"
execution_mode = "cronjob"
description = "Periodic cleanup"
command = "/bin/echo"
args = ["cleanup"]
timeout_ms = 5000
cancellable = false

[bots.beta.tasks.cleanup.cron]
schedule = "0 * * * *"
auto_start = true
`;

test('loadConfig parses multiple bots from TOML', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(configPath, sampleConfig);

  const config = await loadConfig(configPath);

  assert.equal(config.server.port, 3100);
  assert.equal(config.server.serviceReconnectNotificationThresholdMs, 600000);
  assert.deepEqual(Object.keys(config.bots).sort(), ['alpha', 'beta']);
  assert.equal(config.bots.alpha.allowedUsers[0], 'user-1');
  assert.equal(config.bots.alpha.tasks.echo.runnerKind, 'builtin-tool');
  assert.equal(config.bots.alpha.tasks.echo.executionMode, 'oneshot');
  assert.equal(config.bots.alpha.tasks.sc, undefined);
  assert.equal(config.bots.beta.tasks.say.runnerKind, 'external-command');
  assert.equal(config.bots.beta.tasks.say.executionMode, 'oneshot');
  assert.equal(config.bots.beta.tasks.say.args[1], '{{name}}');
  assert.equal(config.bots.beta.tasks.cleanup.executionMode, 'cronjob');
  assert.equal(config.bots.beta.tasks.cleanup.cron?.schedule, '0 * * * *');
  assert.equal(config.bots.beta.tasks.cleanup.cron?.autoStart, true);
});

test('loadConfig accepts explicit global reconnect notification threshold override', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-threshold-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100
service_reconnect_notification_threshold_ms = 120000

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin echo"
tool = "echo"
timeout_ms = 5000
cancellable = true
`,
  );

  const config = await loadConfig(configPath);

  assert.equal(config.server.serviceReconnectNotificationThresholdMs, 120000);
});

test('loadConfig accepts explicit sc configuration and keeps its protected binding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-sc-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.sc]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Capture the current screen and return the image to this chat"
tool = "screencapture"
timeout_ms = 30000
cancellable = false
`,
  );

  const config = await loadConfig(configPath);

  assert.equal(config.bots.alpha.tasks.sc.runnerKind, 'builtin-tool');
  assert.equal(config.bots.alpha.tasks.sc.executionMode, 'oneshot');
  assert.equal(config.bots.alpha.tasks.sc.tool, 'screencapture');
});

test('loadConfig rejects explicit sc configuration that changes its protected binding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-sc-invalid-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.sc]
runner_kind = "external-command"
execution_mode = "oneshot"
description = "Bad binding"
command = "/bin/echo"
args = ["oops"]
timeout_ms = 1000
cancellable = false
`,
  );

  await assert.rejects(
    () => loadConfig(configPath),
    /Predefined task sc must remain a builtin-tool oneshot bound to screencapture/,
  );
});

test('loadConfig accepts explicit update configuration and keeps its protected binding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-update-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.update]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Update this deployment to the latest upstream revision"
tool = "self-update"
timeout_ms = 300000
cancellable = false
`,
  );

  const config = await loadConfig(configPath);

  assert.equal(config.bots.alpha.tasks.update.runnerKind, 'builtin-tool');
  assert.equal(config.bots.alpha.tasks.update.executionMode, 'oneshot');
  assert.equal(config.bots.alpha.tasks.update.tool, 'self-update');
});

test('loadConfig rejects explicit update configuration that changes its protected binding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-update-invalid-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.update]
runner_kind = "external-command"
execution_mode = "oneshot"
description = "Bad binding"
command = "/bin/echo"
args = ["oops"]
timeout_ms = 1000
cancellable = false
`,
  );

  await assert.rejects(
    () => loadConfig(configPath),
    /Predefined task update must remain a builtin-tool oneshot bound to self-update/,
  );
});

test('loadConfig rejects duplicate bot routes or storage paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-dup-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.a]
allowed_users = ["u1"]
[bots.a.server]
card_path = "/same/card"
event_path = "/a/event"
[bots.a.storage]
sqlite_path = "./data/shared.sqlite"
[bots.a.feishu]
app_id = "a"
app_secret = "a"
[bots.a.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin"
tool = "echo"
timeout_ms = 5000
cancellable = true

[bots.b]
allowed_users = ["u2"]
[bots.b.server]
card_path = "/same/card"
event_path = "/b/event"
[bots.b.storage]
sqlite_path = "./data/shared.sqlite"
[bots.b.feishu]
app_id = "b"
app_secret = "b"
[bots.b.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin"
tool = "echo"
timeout_ms = 5000
cancellable = true
`,
  );

  await assert.rejects(() => loadConfig(configPath), /Duplicate (card_path|sqlite_path)/);
});

test('validateParameters enforces required parameters and types', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-params-'));
  const configPath = join(directory, 'bot.toml');
  await writeFile(configPath, sampleConfig);
  const config = await loadConfig(configPath);

  assert.deepEqual(validateParameters(config.bots.alpha.tasks.echo, { message: 'hello' }), {
    message: 'hello',
  });
  assert.throws(
    () => validateParameters(config.bots.alpha.tasks.echo, {}),
    /Missing required parameter/,
  );
  assert.throws(
    () => validateParameters(config.bots.beta.tasks.say, { name: 'ok', extra: 'nope' }),
    /Unknown parameter/,
  );
});

test('loadConfig applies checkPDWin11 defaults without requiring a fixed notification target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-pd-'));
  const validConfigPath = join(directory, 'valid.toml');
  await writeFile(
    validConfigPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.storage]
sqlite_path = "./data/alpha.sqlite"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.check-pd]
runner_kind = "builtin-tool"
execution_mode = "cronjob"
description = "Check PD Windows 11"
tool = "checkPDWin11"
timeout_ms = 5000
cancellable = false

[bots.alpha.tasks.check-pd.cron]
schedule = "*/5 * * * *"
auto_start = true
`,
  );

  const validConfig = await loadConfig(validConfigPath);
  assert.equal(validConfig.bots.alpha.tasks['check-pd'].runnerKind, 'builtin-tool');
  assert.equal(
    validConfig.bots.alpha.tasks['check-pd'].config?.vm_name_match,
    'Windows 11',
  );
});

test('loadConfig defaults bot working directory to ~/.kfc and sqlite path to ~/.kfc/data/{botId}.sqlite', async () => {
  const previousHome = process.env.HOME;
  process.env.HOME = '/Users/example';
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-defaults-'));
  const configPath = join(directory, 'config.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin echo"
tool = "echo"
timeout_ms = 5000
cancellable = true
`,
  );

  try {
    const config = await loadConfig(configPath);
    assert.equal(config.bots.alpha.workingDirectory, '/Users/example/.kfc');
    assert.equal(config.bots.alpha.storage.sqlitePath, '/Users/example/.kfc/data/alpha.sqlite');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('loadConfig resolves relative sqlite paths against the bot working directory', async () => {
  const previousHome = process.env.HOME;
  process.env.HOME = '/Users/example';
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-config-relative-sqlite-'));
  const configPath = join(directory, 'config.toml');
  await writeFile(
    configPath,
    `
[server]
port = 3100

[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.storage]
sqlite_path = "./data/custom.sqlite"

[bots.alpha.feishu]
app_id = "alpha-app"
app_secret = "alpha-secret"

[bots.alpha.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin echo"
tool = "echo"
timeout_ms = 5000
cancellable = true
`,
  );

  try {
    const config = await loadConfig(configPath);
    assert.equal(config.bots.alpha.workingDirectory, '/Users/example/.kfc');
    assert.equal(config.bots.alpha.storage.sqlitePath, '/Users/example/.kfc/data/custom.sqlite');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});
