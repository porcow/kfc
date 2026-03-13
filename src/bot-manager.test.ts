import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { BotManager } from './bot-manager.ts';
import { createAppServer } from './http/server.ts';

function multiBotConfigText(directory: string, extra = ''): string {
  return `
[server]
port = 3400
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

[bots.beta.tasks.say]
runner_kind = "external-command"
execution_mode = "oneshot"
description = "External echo"
command = "${process.execPath}"
args = ["-e", "console.log('beta:' + process.argv[1])", "{{message}}"]
timeout_ms = 5000
cancellable = true

[bots.beta.tasks.say.parameters.message]
type = "string"
required = true
${extra}
`;
}

async function waitForState(
  manager: BotManager,
  botId: string,
  actorId: string,
  runId: string,
  state: string,
): Promise<void> {
  const service = manager.getBot(botId)!;
  for (let index = 0; index < 40; index += 1) {
    const card = service.getRunStatus(actorId, runId).card;
    const text = JSON.stringify(card);
    if (text.includes(`"${state}"`) || text.includes(`**${state}**`)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for state ${state}`);
}

function createBridgeFactory(stateByBotId: Map<string, Record<string, unknown>[]>) {
  return async (service: any) => {
    const botId = service.getBotId();
    const bucket = stateByBotId.get(botId) ?? [];
    stateByBotId.set(botId, bucket);
    const health = {
      state: 'disconnected',
      consecutiveReconnectFailures: 0,
      fallbackEventPath: service.getConfig().server.eventPath,
    };
    const bridge = {
      botId,
      cardPath: service.getConfig().server.cardPath,
      eventPath: service.getConfig().server.eventPath,
      cardHandler() {},
      eventHandler() {},
      async startWebSocketClient() {
        bucket.push({ action: 'start' });
        health.state = 'connected';
        health.lastConnectedAt = '2026-03-12T12:00:00.000Z';
      },
      async close() {
        bucket.push({ action: 'close' });
        health.state = 'disconnected';
      },
      getWebSocketHealth() {
        return { ...health };
      },
    };
    bucket.push({ action: 'create' });
    return bridge;
  };
}

test('manager loads multiple bots and keeps task catalogs isolated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-manager-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath);

  assert.deepEqual(manager.listBotIds(), ['alpha', 'beta']);
  assert.equal(manager.getBot('alpha')?.getConfig().allowedUsers[0], 'operator-a');
  assert.ok(JSON.stringify(manager.getBot('alpha')!.listTasks('operator-a').card).includes('echo'));
  assert.ok(JSON.stringify(manager.getBot('beta')!.listTasks('operator-b').card).includes('say'));
  assert.throws(() => manager.getBot('alpha')!.listTasks('operator-b'), /not authorized/);

  await manager.close();
});

test('manager resolves bot-scoped routes and rejects unknown paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-routes-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath);

  assert.deepEqual(manager.resolveRoute('/bots/alpha/webhook/card'), {
    botId: 'alpha',
    kind: 'card',
  });
  assert.deepEqual(manager.resolveRoute('/bots/beta/webhook/event'), {
    botId: 'beta',
    kind: 'event',
  });
  assert.equal(manager.resolveRoute('/bots/gamma/webhook/card'), undefined);

  await manager.close();
});

test('manager reload is atomic across the full bot map', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-reload-manager-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath);
  assert.deepEqual(manager.listBotIds(), ['alpha', 'beta']);

  await writeFile(
    configPath,
    multiBotConfigText(
      directory,
      `
[bots.gamma]
allowed_users = ["operator-c"]

[bots.gamma.server]
card_path = "/bots/gamma/webhook/card"
event_path = "/bots/gamma/webhook/event"

[bots.gamma.storage]
sqlite_path = "${join(directory, 'gamma.sqlite')}"

[bots.gamma.feishu]
app_id = "gamma-app"
app_secret = "gamma-secret"

[bots.gamma.tasks.echo]
runner_kind = "builtin-tool"
execution_mode = "oneshot"
description = "Builtin echo"
tool = "echo"
timeout_ms = 5000
cancellable = true
`,
    ),
  );
  await manager.reload('alpha', 'operator-a');
  assert.deepEqual(manager.listBotIds(), ['alpha', 'beta', 'gamma']);

  await writeFile(
    configPath,
    multiBotConfigText(
      directory,
      `
[bots.bad]
allowed_users = ["operator-bad"]

[bots.bad.server]
card_path = "/bots/bad/webhook/card"
event_path = "/bots/bad/webhook/event"

[bots.bad.storage]
sqlite_path = "${join(directory, 'bad.sqlite')}"

[bots.bad.feishu]
app_id = "bad-app"
app_secret = "bad-secret"

[bots.bad.tasks.fail]
runner_kind = "unsupported"
execution_mode = "oneshot"
description = "Bad task"
timeout_ms = 5000
cancellable = false
`,
    ),
  );
  await assert.rejects(() => manager.reload('alpha', 'operator-a'));
  assert.deepEqual(manager.listBotIds(), ['alpha', 'beta', 'gamma']);

  await manager.close();
});

test('manager keeps each bot run state and sqlite store isolated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-isolation-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));

  const manager = await BotManager.create(configPath);

  const alpha = manager.getBot('alpha')!;
  const beta = manager.getBot('beta')!;

  const alphaConfirmation = alpha.submitTaskRequest('operator-a', 'echo', { message: 'alpha' });
  const alphaConfirmationId = JSON.parse(JSON.stringify(alphaConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const alphaRunCard = await alpha.confirmTaskRequest('operator-a', alphaConfirmationId);
  const alphaRunId = JSON.parse(JSON.stringify(alphaRunCard.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;

  const betaConfirmation = beta.submitTaskRequest('operator-b', 'say', { message: 'beta' });
  const betaConfirmationId = JSON.parse(JSON.stringify(betaConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const betaRunCard = await beta.confirmTaskRequest('operator-b', betaConfirmationId);
  const betaRunId = JSON.parse(JSON.stringify(betaRunCard.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;

  await waitForState(manager, 'alpha', 'operator-a', alphaRunId, 'succeeded');
  await waitForState(manager, 'beta', 'operator-b', betaRunId, 'succeeded');

  assert.equal(alpha.listRecentRuns('operator-a').length, 1);
  assert.equal(beta.listRecentRuns('operator-b').length, 1);
  assert.equal(alpha.getRunStatus('operator-a', betaRunId).type, 'error');
  assert.equal(beta.getRunStatus('operator-b', alphaRunId).type, 'error');

  const alphaDb = await stat(join(directory, 'alpha.sqlite'));
  const betaDb = await stat(join(directory, 'beta.sqlite'));
  assert.ok(alphaDb.isFile());
  assert.ok(betaDb.isFile());

  const originalConfig = await readFile(configPath, 'utf8');
  assert.ok(originalConfig.includes('[bots.alpha]'));

  await manager.close();
});

test('manager reload explicitly starts replacement websocket clients and close does not spawn replacements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-ws-reload-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));
  const events = new Map<string, Record<string, unknown>[]>();

  const manager = await BotManager.create(configPath, {
    bridgeFactory: createBridgeFactory(events),
  } as any);

  await manager.startWebSockets();
  assert.deepEqual(
    events.get('alpha')?.map((entry) => entry.action),
    ['create', 'start'],
  );
  assert.deepEqual(
    events.get('beta')?.map((entry) => entry.action),
    ['create', 'start'],
  );

  await manager.reload('alpha', 'operator-a');

  assert.deepEqual(
    events.get('alpha')?.map((entry) => entry.action),
    ['create', 'start', 'create', 'close', 'start'],
  );
  assert.deepEqual(
    events.get('beta')?.map((entry) => entry.action),
    ['create', 'start', 'create', 'close', 'start'],
  );

  await manager.close();

  assert.deepEqual(
    events.get('alpha')?.map((entry) => entry.action),
    ['create', 'start', 'create', 'close', 'start', 'close'],
  );
  assert.deepEqual(
    events.get('beta')?.map((entry) => entry.action),
    ['create', 'start', 'create', 'close', 'start', 'close'],
  );
});

test('manager reconciles cronjob tasks on startup and reload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-cron-reconcile-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(
    configPath,
    multiBotConfigText(
      directory,
      `
[bots.alpha.tasks.cleanup]
runner_kind = "external-command"
execution_mode = "cronjob"
description = "Cleanup"
command = "/bin/echo"
args = ["cleanup"]
timeout_ms = 5000
cancellable = false

[bots.alpha.tasks.cleanup.cron]
schedule = "0 * * * *"
auto_start = true
`,
    )
      .replaceAll('type = "builtin-tool"', 'runner_kind = "builtin-tool"\nexecution_mode = "oneshot"')
      .replaceAll('type = "external-command"', 'runner_kind = "external-command"\nexecution_mode = "oneshot"'),
  );

  const reconcileCalls: string[] = [];
  const manager = await BotManager.create(configPath, {
    cronControllerFactory(botConfig: any, repository: any) {
      return {
        async list() {
          return repository.listCronJobs();
        },
        async start() {
          throw new Error('unused');
        },
        async stop() {
          throw new Error('unused');
        },
        async reconcile() {
          reconcileCalls.push(botConfig.botId);
        },
      };
    },
  } as any);

  assert.deepEqual(reconcileCalls, ['alpha', 'beta']);
  await manager.reload('alpha', 'operator-a');
  assert.deepEqual(reconcileCalls, ['alpha', 'beta', 'alpha', 'beta']);
  await manager.close();
});

test('health endpoint reports bot-scoped websocket health', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-health-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));
  const manager = await BotManager.create(configPath, {
    bridgeFactory: createBridgeFactory(new Map()),
  } as any);
  const server = await createAppServer(manager, { startWebSockets: true });
  const handler = server.listeners('request')[0] as (request: any, response: any) => void;
  let body = '';
  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(value?: string) {
      body = value ?? '';
    },
  };

  handler(
    {
      url: '/health',
      method: 'GET',
      socket: {
        remoteAddress: '127.0.0.1',
      },
    },
    response,
  );

  const payload = JSON.parse(body) as Record<string, any>;
  assert.deepEqual(payload.bots, ['alpha', 'beta']);
  assert.equal(payload.websocket.alpha.state, 'connected');
  assert.equal(payload.websocket.beta.state, 'connected');
  await manager.close();
});

test('health endpoint distinguishes degraded websocket ingress and surfaces warnings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-health-warning-'));
  const configPath = join(directory, 'bots.toml');
  await writeFile(configPath, multiBotConfigText(directory));
  const manager = await BotManager.create(configPath, {
    bridgeFactory: async (service: any) => ({
      botId: service.getBotId(),
      cardPath: service.getConfig().server.cardPath,
      eventPath: service.getConfig().server.eventPath,
      cardHandler() {},
      eventHandler() {},
      async startWebSocketClient() {},
      async close() {},
      getWebSocketHealth() {
        return {
          state: service.getBotId() === 'alpha' ? 'reconnecting' : 'connected',
          consecutiveReconnectFailures: service.getBotId() === 'alpha' ? 4 : 0,
          fallbackEventPath: service.getConfig().server.eventPath,
          nextReconnectAt:
            service.getBotId() === 'alpha' ? '2026-03-12T12:30:00.000Z' : undefined,
          warning:
            service.getBotId() === 'alpha'
              ? `WebSocket reconnect failures exceeded 3. Consider switching bot event delivery to ${service.getConfig().server.eventPath}.`
              : undefined,
        };
      },
    }),
  } as any);
  const server = await createAppServer(manager, { startWebSockets: false });
  const handler = server.listeners('request')[0] as (request: any, response: any) => void;
  let body = '';
  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(value?: string) {
      body = value ?? '';
    },
  };

  handler(
    {
      url: '/health',
      method: 'GET',
      socket: {
        remoteAddress: '127.0.0.1',
      },
    },
    response,
  );

  const payload = JSON.parse(body) as Record<string, any>;
  assert.equal(payload.ready, false);
  assert.equal(payload.websocket.alpha.state, 'reconnecting');
  assert.match(payload.websocket.alpha.warning, /webhook\/event/u);
  assert.equal(payload.websocket.beta.state, 'connected');

  await manager.close();
});
