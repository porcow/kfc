import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from './test-compat.ts';

import { BotManager } from './bot-manager.ts';
import { loadConfig } from './config/schema.ts';
import { authorizePairing, invokeLocalReload, updateAllowedUsersInToml } from './pairing.ts';
import { RunRepository } from './persistence/run-repository.ts';

function multiBotConfigText(directory: string): string {
  return `
[server]
port = 3401
health_path = "/health"

[bots.alpha]
allowed_users = ["operator-a"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
event_path = "/bots/alpha/webhook/event"

[bots.alpha.storage]
sqlite_path = "${join(directory, 'alpha.sqlite')}"

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
allowed_users = ["operator-b"]

[bots.beta.server]
card_path = "/bots/beta/webhook/card"
event_path = "/bots/beta/webhook/event"

[bots.beta.storage]
sqlite_path = "${join(directory, 'beta.sqlite')}"

[bots.beta.feishu]
app_id = "beta-app"
app_secret = "beta-secret"
verification_token = "beta-token"
encrypt_key = "beta-encrypt"

[bots.beta.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin echo"
tool = "echo"
timeout_ms = 5000
cancellable = true
`;
}

function createNoopPowerObserver() {
  return {
    start() {},
    async close() {},
  };
}

test('updateAllowedUsersInToml appends one actor and keeps duplicates out', () => {
  const source = `
[bots.alpha]
allowed_users = ["user-1"]

[bots.alpha.server]
card_path = "/bots/alpha/webhook/card"
`;

  const first = updateAllowedUsersInToml(source, 'alpha', 'user-2');
  assert.equal(first.changed, true);
  assert.ok(first.text.includes('allowed_users = ["user-1", "user-2"]'));

  const second = updateAllowedUsersInToml(first.text, 'alpha', 'user-2');
  assert.equal(second.changed, false);
  assert.ok(second.text.includes('allowed_users = ["user-1", "user-2"]'));
});

test('authorizePairing updates TOML and triggers immediate reload without restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pairing-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath, {
    powerObserverFactory: createNoopPowerObserver,
  } as any);
  const alpha = manager.getBot('alpha')!;
  const unauthorized = await alpha.handleMessage('new-user', '/tasks');
  const pairingCode = JSON.stringify(unauthorized.card).match(/\balpha-[A-Za-z0-9]{6}\b/u)?.[0];
  assert.ok(pairingCode);

  let reloadCalls = 0;
  const result = await authorizePairing({
    configPath,
      pairCode: pairingCode!,
      reload: async (botId) => {
        reloadCalls += 1;
        await manager.reload(botId, 'local-admin');
    },
  });

  assert.equal(result.actorId, 'new-user');
  assert.equal(reloadCalls, 1);
  assert.ok(JSON.stringify(manager.getBot('alpha')!.listTasks('new-user').card).includes('echo'));

  const config = await loadConfig(configPath);
  assert.ok(config.bots.alpha.allowedUsers.includes('new-user'));

  await manager.close();
});

test('authorizePairing leaves a code unused when reload fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pairing-reload-fail-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath, {
    powerObserverFactory: createNoopPowerObserver,
  } as any);
  const unauthorized = await manager.getBot('alpha')!.handleMessage('new-user', '/tasks');
  const pairingCode = JSON.stringify(unauthorized.card).match(/\balpha-[A-Za-z0-9]{6}\b/u)?.[0];
  assert.ok(pairingCode);

  await assert.rejects(
    () =>
      authorizePairing({
        configPath,
        pairCode: pairingCode!,
        reload: async () => {
          throw new Error('reload failed');
        },
      }),
    /reload failed/,
  );

  const config = await loadConfig(configPath);
  const repository = new RunRepository(config.bots.alpha.storage.sqlitePath);
  try {
    assert.equal(repository.getPairing(pairingCode!)?.usedAt, undefined);
  } finally {
    repository.close();
  }

  await manager.close();
});

test('authorizePairing rejects expired codes and does not update config', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pairing-expired-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const config = await loadConfig(configPath);
  const repository = new RunRepository(config.bots.alpha.storage.sqlitePath);
  repository.createPairing('new-user', {
    pairCode: 'alpha-ABC123',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  await assert.rejects(
    () =>
      authorizePairing({
        configPath,
        pairCode: 'alpha-ABC123',
        reload: async () => undefined,
      }),
    /expired/i,
  );

  const updated = await readFile(configPath, 'utf8');
  assert.ok(!updated.includes('new-user'));
  repository.close();
});

test('authorizePairing keeps pairing codes isolated per bot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pairing-isolation-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath, {
    powerObserverFactory: createNoopPowerObserver,
  } as any);
  const unauthorized = await manager.getBot('beta')!.handleMessage('beta-new-user', '/tasks');
  const pairingCode = JSON.stringify(unauthorized.card).match(/\bbeta-[A-Za-z0-9]{6}\b/u)?.[0];
  assert.ok(pairingCode);

  const result = await authorizePairing({
    configPath,
    pairCode: pairingCode!,
    reload: async (botId) => {
      await manager.reload(botId, 'local-admin');
    },
  });

  assert.equal(result.actorId, 'beta-new-user');
  assert.ok(JSON.stringify(manager.getBot('beta')!.listTasks('beta-new-user').card).includes('echo'));
  assert.throws(() => manager.getBot('alpha')!.listTasks('beta-new-user'), /not authorized/);

  await manager.close();
});

test('invokeLocalReload posts to the local admin reload endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestedBody = '';
  globalThis.fetch = async (input, init) =>
    ({
      ok: true,
      async json() {
        requestedUrl = String(input);
        requestedBody = String(init?.body ?? '');
        return { botCount: 1 };
      },
    }) as Response;

  try {
    const response = await invokeLocalReload({
      port: 3401,
      botId: 'alpha',
    });

    assert.equal(response.botCount, 1);
    assert.equal(requestedUrl, 'http://127.0.0.1:3401/admin/reload');
    assert.equal(requestedBody, JSON.stringify({ botId: 'alpha' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
