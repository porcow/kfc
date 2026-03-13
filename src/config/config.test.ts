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
  assert.deepEqual(Object.keys(config.bots).sort(), ['alpha', 'beta']);
  assert.equal(config.bots.alpha.allowedUsers[0], 'user-1');
  assert.equal(config.bots.alpha.tasks.echo.runnerKind, 'builtin-tool');
  assert.equal(config.bots.alpha.tasks.echo.executionMode, 'oneshot');
  assert.equal(config.bots.beta.tasks.say.runnerKind, 'external-command');
  assert.equal(config.bots.beta.tasks.say.executionMode, 'oneshot');
  assert.equal(config.bots.beta.tasks.say.args[1], '{{name}}');
  assert.equal(config.bots.beta.tasks.cleanup.executionMode, 'cronjob');
  assert.equal(config.bots.beta.tasks.cleanup.cron?.schedule, '0 * * * *');
  assert.equal(config.bots.beta.tasks.cleanup.cron?.autoStart, true);
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
