import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from './test-compat.ts';
import assert from 'node:assert/strict';
import type { BotConfig } from './domain.ts';
import { formatFeishuTimestamp } from './feishu/timestamp.ts';
import { RunRepository } from './persistence/run-repository.ts';
import {
  KidsAlfredService,
  MemoryEventLogSink,
  MemoryRunUpdateSink,
} from './service.ts';

function createBotConfig(botId: string, databasePath: string): BotConfig {
  return {
    botId,
    workingDirectory: '/Users/example/.kfc',
    allowedUsers: ['operator-1'],
    storage: {
      sqlitePath: databasePath,
    },
    feishu: {
      appId: `${botId}-app`,
      appSecret: `${botId}-secret`,
      verificationToken: `${botId}-token`,
      encryptKey: `${botId}-encrypt`,
    },
    tasks: {
      echo: {
        id: 'echo',
        runnerKind: 'builtin-tool',
        executionMode: 'oneshot',
        description: 'Builtin echo',
        tool: 'echo',
        timeoutMs: 5000,
        cancellable: true,
        parameters: {
          message: {
            type: 'string',
            required: true,
          },
        },
      },
      sc: {
        id: 'sc',
        runnerKind: 'builtin-tool',
        executionMode: 'oneshot',
        description: 'Capture the current screen and return the image to this chat',
        tool: 'screencapture',
        timeoutMs: 30000,
        cancellable: false,
        parameters: {},
      },
      external: {
        id: 'external',
        runnerKind: 'external-command',
        executionMode: 'oneshot',
        description: 'External echo',
        command: process.execPath,
        args: ['-e', "console.log('external:' + process.argv[1])", '{{message}}'],
        timeoutMs: 5000,
        cancellable: true,
        parameters: {
          message: {
            type: 'string',
            required: true,
          },
        },
      },
      slow: {
        id: 'slow',
        runnerKind: 'external-command',
        executionMode: 'oneshot',
        description: 'Slow task',
        command: process.execPath,
        args: ['-e', "setTimeout(() => console.log('done'), 1000)"],
        timeoutMs: 50,
        cancellable: true,
        parameters: {},
      },
      'cancel-slow': {
        id: 'cancel-slow',
        runnerKind: 'external-command',
        executionMode: 'oneshot',
        description: 'Cancellable slow task',
        command: process.execPath,
        args: ['-e', "setTimeout(() => console.log('cancelled-late'), 1000)"],
        timeoutMs: 5000,
        cancellable: true,
        parameters: {},
      },
      'never-cancel': {
        id: 'never-cancel',
        runnerKind: 'external-command',
        executionMode: 'oneshot',
        description: 'Non cancellable',
        command: process.execPath,
        args: ['-e', "setTimeout(() => console.log('done'), 1000)"],
        timeoutMs: 5000,
        cancellable: false,
        parameters: {},
      },
      cleanup: {
        id: 'cleanup',
        runnerKind: 'external-command',
        executionMode: 'cronjob',
        description: 'Periodic cleanup',
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
    },
    loadedAt: new Date().toISOString(),
  };
}

async function waitForState(
  service: KidsAlfredService,
  actorId: string,
  runId: string,
  state: string,
): Promise<void> {
  for (let index = 0; index < 800; index += 1) {
    const card = service.getRunStatus(actorId, runId).card;
    const text = JSON.stringify(card);
    if (text.includes(`"${state}"`) || text.includes(`**${state}**`)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for state ${state}`);
}

test('service enforces auth, duplicate confirmation, and run lookup', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-service-'));
  const databasePath = join(directory, 'runs.sqlite');
  const updates = new MemoryRunUpdateSink();
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath), updates);

  assert.throws(() => service.listTasks('unknown-user'), /not authorized/);

  const confirmation = service.submitTaskRequest('operator-1', 'echo', { message: 'hi' });
  const confirmationId = JSON.parse(JSON.stringify(confirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0];
  assert.ok(confirmationId);

  const firstRun = await service.confirmTaskRequest('operator-1', confirmationId!);
  const runId = JSON.parse(JSON.stringify(firstRun.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0];
  assert.ok(runId);

  const duplicateRun = await service.confirmTaskRequest('operator-1', confirmationId!);
  assert.ok(JSON.stringify(duplicateRun.card).includes(runId!));

  await waitForState(service, 'operator-1', runId!, 'succeeded');
  const recent = service.listRecentRuns('operator-1');
  assert.equal(recent.length, 1);
  assert.equal(recent[0].runId, runId);
  assert.ok(updates.updates.some((run) => run.state === 'running'));

  await service.close();
});

test('service delegates reload through the injected handler', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-reload-'));
  const databasePath = join(directory, 'runs.sqlite');
  const calls: string[] = [];
  const service = new KidsAlfredService(
    createBotConfig('alpha', databasePath),
    new MemoryRunUpdateSink(),
    async (botId, actorId) => {
      calls.push(`${botId}:${actorId}`);
      return { botCount: 2 };
    },
  );

  const reloadCard = await service.reloadConfig('operator-1');
  assert.ok(JSON.stringify(reloadCard.card).includes('2 bot configuration'));
  assert.deepEqual(calls, ['alpha:operator-1']);

  await service.close();
});

test('service exposes informational task cards and text-driven confirmation flow', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-cards-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const taskList = await service.handleMessage('operator-1', '/tasks');
  const taskListJson = JSON.stringify(taskList.card);
  assert.equal(taskList.type, 'card');
  assert.ok(taskListJson.includes('/run echo message='));
  assert.ok(taskListJson.includes('/run sc'));
  assert.ok(taskListJson.includes('example-message'));
  assert.ok(!taskListJson.includes('cleanup'));
  assert.ok(!taskListJson.includes('"tag":"button"'));

  const invalidRun = await service.handleMessage('operator-1', '/run echo');
  const invalidRunJson = JSON.stringify(invalidRun.card);
  assert.ok(invalidRunJson.includes('Missing required parameter: message'));
  assert.ok(!invalidRunJson.includes('confirm_'));

  const confirmation = await service.handleMessage('operator-1', '/run echo message="from chat"');
  const confirmationJson = JSON.stringify(confirmation.card);
  const confirmationId = confirmationJson.match(/confirm_[\w-]+/u)?.[0];
  assert.ok(confirmationId);
  assert.ok(confirmationJson.includes('"type":"confirm_task"'));
  assert.ok(confirmationJson.includes('"type":"cancel_confirmation"'));

  const runCard = await service.handleCardAction('operator-1', {
    type: 'confirm_task',
    confirmationId,
  });
  const runCardJson = JSON.stringify(runCard.card);
  assert.ok(runCardJson.includes('Run queued'));
  assert.ok(!runCardJson.includes('"tag":"button"'));

  await service.close();
});

test('service hides sc when the current bot has not configured it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-no-sc-'));
  const databasePath = join(directory, 'runs.sqlite');
  const botConfig = createBotConfig('alpha', databasePath);
  delete botConfig.tasks.sc;
  const service = new KidsAlfredService(botConfig);

  const taskList = await service.handleMessage('operator-1', '/tasks');
  const taskListJson = JSON.stringify(taskList.card);
  assert.ok(!taskListJson.includes('/run sc'));

  const help = await service.handleMessage('operator-1', '/help');
  const helpJson = JSON.stringify(help.card);
  assert.ok(!helpJson.includes('/run sc'));

  const unsupported = await service.handleMessage('operator-1', '/unknown');
  const unsupportedJson = JSON.stringify(unsupported.card);
  assert.ok(!unsupportedJson.includes('/run sc'));

  const runSc = await service.handleMessage('operator-1', '/run sc', { chatId: 'chat-no-sc-1' });
  assert.ok(JSON.stringify(runSc.card).includes('Unknown task: sc'));

  await service.close();
});

test('service routes cronjob tasks through /cron and rejects mode mismatches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-cron-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const cronList = await service.handleMessage('operator-1', '/cron list', { chatId: 'chat-a' });
  const cronListJson = JSON.stringify(cronList.card);
  assert.ok(cronListJson.includes('Cron tasks'));
  assert.ok(cronListJson.includes('cleanup'));
  assert.ok(!cronListJson.includes('echo'));
  assert.ok(cronListJson.includes('Subscribed: **false**'));

  const runCron = await service.handleMessage('operator-1', '/run cleanup');
  assert.ok(JSON.stringify(runCron.card).includes('/cron'));

  const startCron = await service.handleMessage('operator-1', '/cron start cleanup', {
    chatId: 'chat-a',
  });
  const startCronJson = JSON.stringify(startCron.card);
  assert.ok(startCronJson.includes('Cron task started'));
  assert.ok(!startCronJson.includes('\"content\":\"Cron tasks\"'));
  assert.ok(startCronJson.includes('cleanup'));
  assert.ok(startCronJson.includes('Subscribed: **true**'));
  assert.ok(startCronJson.includes('State: **running**'));

  const duplicateStartCron = await service.handleMessage('operator-1', '/cron start cleanup', {
    chatId: 'chat-b',
  });
  const duplicateStartJson = JSON.stringify(duplicateStartCron.card);
  assert.ok(duplicateStartJson.includes('Subscribed: **true**'));
  assert.ok(duplicateStartJson.includes('State: **running**'));

  const cronStatus = await service.handleMessage('operator-1', '/cron status', {
    chatId: 'chat-a',
  });
  const cronStatusJson = JSON.stringify(cronStatus.card);
  assert.ok(cronStatusJson.includes('cleanup'));
  assert.ok(cronStatusJson.includes('Observed: **running**'));
  assert.ok(!cronStatusJson.includes('Subscribed:'));

  const stopCron = await service.handleMessage('operator-1', '/cron stop cleanup', {
    chatId: 'chat-a',
  });
  const stopCronJson = JSON.stringify(stopCron.card);
  assert.ok(stopCronJson.includes('Cron task stopped'));
  assert.ok(!stopCronJson.includes('\"content\":\"Cron tasks\"'));
  assert.ok(stopCronJson.includes('Subscribed: **false**'));
  assert.ok(stopCronJson.includes('State: **stopped**'));

  const startOneshot = await service.handleMessage('operator-1', '/cron start echo');
  assert.ok(JSON.stringify(startOneshot.card).includes('not a cronjob'));

  await service.close();
});

test('service reconciles allowed users into default service event subscriptions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-service-event-subscriptions-'));
  const databasePath = join(directory, 'runs.sqlite');
  const repository = new RunRepository(databasePath);
  repository.upsertServiceEventSubscription('stale-user', 'service_online', true);
  repository.upsertServiceEventSubscription('stale-user', 'service_reconnected', true);
  const botConfig = createBotConfig('alpha', databasePath);
  botConfig.allowedUsers = ['operator-1', 'operator-2'];
  const service = new KidsAlfredService(
    botConfig,
    new MemoryRunUpdateSink(),
    undefined,
    undefined,
    undefined,
    repository,
  );

  service.reconcileServiceEventSubscriptions();

  assert.deepEqual(service.listServiceEventSubscriberActorIds('service_online'), [
    'operator-1',
    'operator-2',
  ]);
  assert.deepEqual(service.listServiceEventSubscriberActorIds('service_reconnected'), [
    'operator-1',
    'operator-2',
  ]);
  assert.equal(repository.getServiceEventSubscription('stale-user', 'service_online'), undefined);

  await service.close();
});

test('service returns a task-agnostic help card for authorized users', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-help-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));
  service.setHealthSnapshotProvider(() => ({
    ok: true,
    loadedAt: '2026-03-14T08:00:00.000Z',
    bots: ['alpha'],
    websocket: {
      alpha: {
        state: 'connected',
        consecutiveReconnectFailures: 0,
      },
    },
    ready: true,
  }));

  const help = await service.handleMessage('operator-1', '/help');
  const helpJson = JSON.stringify(help.card);

  assert.equal(help.type, 'card');
  assert.ok(helpJson.includes('Available commands'));
  assert.ok(helpJson.includes('/server health'));
  assert.ok(helpJson.includes('/tasks'));
  assert.ok(helpJson.includes('/run TASK_ID key=value ...'));
  assert.ok(helpJson.includes('/run-status RUN_ID'));
  assert.ok(helpJson.includes('/cancel RUN_ID'));
  assert.ok(helpJson.includes('/reload'));
  assert.ok(helpJson.includes('/run sc'));
  assert.ok(!helpJson.includes('`/health`'));
  assert.ok(helpJson.includes('Use `/tasks` to see task-specific example commands.'));
  assert.ok(!helpJson.includes('Builtin echo'));
  assert.ok(!helpJson.includes('/run echo message='));

  const unsupported = await service.handleMessage('operator-1', '/unknown');
  assert.ok(JSON.stringify(unsupported.card).includes('Unsupported command'));

  await service.close();
});

test('service help advertises update and rollback only when explicitly configured', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-help-update-'));
  const databasePath = join(directory, 'runs.sqlite');
  const botConfig = createBotConfig('alpha', databasePath);
  botConfig.tasks.update = {
    id: 'update',
    runnerKind: 'builtin-tool',
    executionMode: 'oneshot',
    description: 'Update this deployment to the latest stable GitHub Release',
    tool: 'self-update',
    timeoutMs: 300000,
    cancellable: false,
    parameters: {},
  };
  botConfig.tasks.rollback = {
    id: 'rollback',
    runnerKind: 'builtin-tool',
    executionMode: 'oneshot',
    description: 'Rollback this deployment to the previous local install',
    tool: 'self-rollback',
    timeoutMs: 300000,
    cancellable: false,
    parameters: {},
  };
  const service = new KidsAlfredService(botConfig);

  const help = await service.handleMessage('operator-1', '/help');
  const helpJson = JSON.stringify(help.card);

  assert.ok(helpJson.includes('/server update'));
  assert.ok(helpJson.includes('/server rollback'));
  assert.ok(!helpJson.includes('/run update'));
  assert.ok(!helpJson.includes('/run rollback'));

  await service.close();
});

test('service routes /run sc through the standard confirmation flow', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-sc-run-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const confirmation = await service.handleMessage('operator-1', '/run sc', { chatId: 'chat-sc-1' });
  const confirmationId = JSON.stringify(confirmation.card).match(/confirm_[\w-]+/u)?.[0];
  assert.ok(confirmationId);
  const confirmationJson = JSON.stringify(confirmation.card);
  assert.ok(confirmationJson.includes('sc'));
  assert.ok(confirmationJson.includes('"type":"confirm_task"'));

  await service.close();
});

test('service returns health from the shared snapshot for authorized users', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-health-command-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));
  service.setHealthSnapshotProvider(() => ({
    ok: true,
    loadedAt: '2026-03-14T08:00:00.000Z',
    bots: ['alpha', 'beta'],
    degraded: true,
    botHealth: {
      alpha: {
        websocket: {
          state: 'connected',
          consecutiveReconnectFailures: 0,
        },
        availability: {
          ingressAvailable: true,
          activeIngress: 'websocket',
          degraded: false,
          summary: 'Available via WebSocket',
        },
      },
      beta: {
        websocket: {
          state: 'reconnecting',
          consecutiveReconnectFailures: 2,
          nextReconnectAt: '2026-03-14T08:10:00.000Z',
          lastEventReceivedAt: '2026-03-14T08:09:40.000Z',
          lastEventType: 'im.message.receive_v1',
        },
        availability: {
          ingressAvailable: true,
          activeIngress: 'websocket',
          degraded: true,
          summary: 'Available via WebSocket ingress while transport state is reconnecting',
        },
      },
    },
    ready: true,
  }));

  const health = await service.handleMessage('operator-1', '/server health', { chatId: 'chat-health-1' });
  const healthJson = JSON.stringify(health.card);

  assert.equal(health.type, 'card');
  assert.ok(healthJson.includes('Service health'));
  assert.ok(healthJson.includes('Ready: **true**'));
  assert.ok(healthJson.includes('Available: **true**'));
  assert.ok(healthJson.includes('Active ingress: **websocket**'));
  assert.ok(healthJson.includes('Degraded: **true**'));
  assert.ok(healthJson.includes('alpha'));
  assert.ok(healthJson.includes('beta'));
  assert.ok(healthJson.includes('reconnecting'));
  assert.ok(healthJson.includes(formatFeishuTimestamp('2026-03-14T08:00:00.000Z')));
  assert.ok(healthJson.includes(formatFeishuTimestamp('2026-03-14T08:10:00.000Z')));
  assert.ok(healthJson.includes(formatFeishuTimestamp('2026-03-14T08:09:40.000Z')));
  assert.ok(!healthJson.includes('2026-03-14T08:00:00.000Z'));
  assert.ok(!healthJson.includes('2026-03-14T08:10:00.000Z'));
  assert.ok(!healthJson.includes('2026-03-14T08:09:40.000Z'));

  await service.close();
});

test('service routes /server update and /server rollback through the existing confirmation flow only when configured', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-server-commands-'));
  const databasePath = join(directory, 'runs.sqlite');
  const botConfig = createBotConfig('alpha', databasePath);
  botConfig.tasks.update = {
    id: 'update',
    runnerKind: 'builtin-tool',
    executionMode: 'oneshot',
    description: 'Update this deployment to the latest stable GitHub Release',
    tool: 'self-update',
    timeoutMs: 300000,
    cancellable: false,
    parameters: {},
  };
  botConfig.tasks.rollback = {
    id: 'rollback',
    runnerKind: 'builtin-tool',
    executionMode: 'oneshot',
    description: 'Rollback this deployment to the previous local install',
    tool: 'self-rollback',
    timeoutMs: 300000,
    cancellable: false,
    parameters: {},
  };
  const service = new KidsAlfredService(botConfig);

  const updateConfirmation = await service.handleMessage('operator-1', '/server update', { chatId: 'chat-update-1' });
  const updateJson = JSON.stringify(updateConfirmation.card);
  assert.ok(updateJson.includes('"type":"confirm_task"'));
  assert.ok(updateJson.includes('update'));

  const rollbackConfirmation = await service.handleMessage('operator-1', '/server rollback', {
    chatId: 'chat-rollback-1',
  });
  const rollbackJson = JSON.stringify(rollbackConfirmation.card);
  assert.ok(rollbackJson.includes('"type":"confirm_task"'));
  assert.ok(rollbackJson.includes('rollback'));

  const oldUpdate = await service.handleMessage('operator-1', '/run update', { chatId: 'chat-update-legacy' });
  assert.ok(JSON.stringify(oldUpdate.card).includes('Unsupported command'));

  const oldRollback = await service.handleMessage('operator-1', '/run rollback', { chatId: 'chat-rollback-legacy' });
  assert.ok(JSON.stringify(oldRollback.card).includes('Unsupported command'));

  await service.close();
});

test(
  'service persists origin chat context and returns canonical run status cards',
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-run-contract-'));
    const databasePath = join(directory, 'runs.sqlite');
    const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

    const confirmation = await service.handleMessage(
      'operator-1',
      '/run echo message="from chat"',
      { chatId: 'chat-contract-1' },
    );
    const confirmationId = JSON.stringify(confirmation.card).match(/confirm_[\w-]+/u)?.[0];
    assert.ok(confirmationId);

    const queuedRun = await service.handleCardAction('operator-1', {
      type: 'confirm_task',
      confirmationId,
    });
    const queuedJson = JSON.stringify(queuedRun.card);
    const runId = queuedJson.match(/run_[\w-]+/u)?.[0];
    assert.ok(runId);
    assert.ok(queuedJson.includes('Run ID'));
    assert.ok(queuedJson.includes('Started At'));
    assert.ok(queuedJson.includes('Finished At'));
    assert.ok(queuedJson.includes('Started At: n/a'));
    assert.ok(queuedJson.includes('Finished At: n/a'));

    await waitForState(service, 'operator-1', runId!, 'succeeded');
    const completed = service.getRunStatus('operator-1', runId!);
    const completedJson = JSON.stringify(completed.card);
    assert.ok(completedJson.includes('Started At'));
    assert.ok(completedJson.includes('Finished At'));
    assert.match(completedJson, /Started At: 20\d\d\/\d\d\/\d\d \d\d:\d\d:\d\d/u);
    assert.match(completedJson, /Finished At: 20\d\d\/\d\d\/\d\d \d\d:\d\d:\d\d/u);
    assert.doesNotMatch(completedJson, /Started At: \d{4}-\d{2}-\d{2}T/u);
    assert.doesNotMatch(completedJson, /Finished At: \d{4}-\d{2}-\d{2}T/u);

    const [stored] = service.listRecentRuns('operator-1');
    assert.equal(stored.originChatId, 'chat-contract-1');
    assert.match(stored.startedAt ?? '', /T/u);
    assert.match(stored.finishedAt ?? '', /T/u);

    await service.close();
  },
);

test('service cancels pending confirmations without creating a run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pending-cancel-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const confirmation = await service.handleMessage('operator-1', '/run echo message="from chat"');
  const confirmationJson = JSON.stringify(confirmation.card);
  const confirmationId = confirmationJson.match(/confirm_[\w-]+/u)?.[0];
  assert.ok(confirmationId);

  const cancelled = await service.handleCardAction('operator-1', {
    type: 'cancel_confirmation',
    confirmationId,
  });
  const cancelledJson = JSON.stringify(cancelled.card);
  assert.ok(cancelledJson.includes('Request cancelled'));

  const afterCancel = await service.handleCardAction('operator-1', {
    type: 'confirm_task',
    confirmationId,
  });
  assert.ok(JSON.stringify(afterCancel.card).includes('Unknown confirmation token'));

  await service.close();
});

test('card actions fall back to the confirmation owner when actor id is missing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-card-actor-fallback-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const confirmation = await service.handleMessage(
    'operator-1',
    '/run echo message="from card callback"',
    { chatId: 'chat-fallback-1' },
  );
  const confirmationId = JSON.stringify(confirmation.card).match(/confirm_[\w-]+/u)?.[0];
  assert.ok(confirmationId);

  const runCard = await service.handleCardAction('', {
    type: 'confirm_task',
    confirmationId,
  });
  const runCardJson = JSON.stringify(runCard.card);
  const runId = runCardJson.match(/run_[\w-]+/u)?.[0];
  assert.ok(runId);
  assert.ok(runCardJson.includes('Run queued'));

  await waitForState(service, 'operator-1', runId!, 'succeeded');

  await service.close();
});

test('message and card handlers return authorization and validation feedback as cards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-errors-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const unauthorized = await service.handleMessage('unknown-user', '/tasks');
  assert.equal(unauthorized.type, 'error');
  assert.ok(JSON.stringify(unauthorized.card).includes('kfc pair alpha-'));
  assert.ok(JSON.stringify(unauthorized.card).match(/\balpha-[A-Za-z0-9]{6}\b/u));
  assert.ok(!JSON.stringify(unauthorized.card).includes('Builtin echo'));

  const unauthorizedHelp = await service.handleMessage('unknown-user', '/help');
  assert.equal(unauthorizedHelp.type, 'error');
  assert.ok(JSON.stringify(unauthorizedHelp.card).includes('kfc pair alpha-'));
  assert.ok(!JSON.stringify(unauthorizedHelp.card).includes('Available commands'));

  const unauthorizedHealth = await service.handleMessage('unknown-user', '/server health');
  assert.equal(unauthorizedHealth.type, 'error');
  assert.ok(JSON.stringify(unauthorizedHealth.card).includes('kfc pair alpha-'));
  assert.ok(!JSON.stringify(unauthorizedHealth.card).includes('Service health'));

  const unknownTask = await service.handleMessage('operator-1', '/run missing-task message="x"');
  assert.equal(unknownTask.type, 'error');
  assert.ok(JSON.stringify(unknownTask.card).includes('Unknown task'));

  const unauthorizedAction = await service.handleCardAction('unknown-user', {
    type: 'confirm_task',
    confirmationId: 'confirm_x',
  });
  assert.ok(JSON.stringify(unauthorizedAction.card).includes('kfc pair alpha-'));

  const malformedRun = await service.handleMessage('operator-1', '/run echo broken');
  assert.ok(JSON.stringify(malformedRun.card).includes('Invalid parameter syntax'));

  await service.close();
});

test('service emits structured event logs for message and card decisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-event-logs-'));
  const databasePath = join(directory, 'runs.sqlite');
  const eventLogs = new MemoryEventLogSink();
  const service = new KidsAlfredService(
    createBotConfig('alpha', databasePath),
    new MemoryRunUpdateSink(),
    undefined,
    eventLogs,
  );

  await service.handleMessage('operator-1', '/tasks', { chatId: 'chat-logs-1' });
  await service.handleMessage('unknown-user', '/tasks', { chatId: 'chat-logs-2' });
  await service.handleMessage('operator-1', '/run echo broken', { chatId: 'chat-logs-3' });
  const confirmation = await service.handleMessage(
    'operator-1',
    '/run echo message="super secret value"',
    { chatId: 'chat-logs-4' },
  );
  const confirmationId = JSON.stringify(confirmation.card).match(/confirm_[\w-]+/u)?.[0];
  assert.ok(confirmationId);

  await service.handleCardAction('operator-1', {
    type: 'confirm_task',
    confirmationId,
  });

  const cancelConfirmation = await service.handleMessage(
    'operator-1',
    '/run echo message="cancel me"',
    { chatId: 'chat-logs-5' },
  );
  const cancelConfirmationId = JSON.stringify(cancelConfirmation.card).match(/confirm_[\w-]+/u)?.[0];
  assert.ok(cancelConfirmationId);
  await service.handleCardAction('operator-1', {
    type: 'cancel_confirmation',
    confirmationId: cancelConfirmationId,
  });

  assert.equal(eventLogs.entries.length, 7);

  assert.deepEqual(
    {
      eventType: eventLogs.entries[0].eventType,
      actorId: eventLogs.entries[0].actorId,
      chatId: eventLogs.entries[0].chatId,
      commandType: eventLogs.entries[0].commandType,
      decision: eventLogs.entries[0].decision,
    },
    {
      eventType: 'im.message.receive_v1',
      actorId: 'operator-1',
      chatId: 'chat-logs-1',
      commandType: 'tasks',
      decision: 'tasks_listed',
    },
  );

  assert.deepEqual(
    {
      eventType: eventLogs.entries[1].eventType,
      actorId: eventLogs.entries[1].actorId,
      decision: eventLogs.entries[1].decision,
      commandType: eventLogs.entries[1].commandType,
    },
    {
      eventType: 'im.message.receive_v1',
      actorId: 'unknown-user',
      decision: 'authorization_required',
      commandType: 'tasks',
    },
  );

  assert.deepEqual(
    {
      decision: eventLogs.entries[2].decision,
      commandType: eventLogs.entries[2].commandType,
      errorSummary: eventLogs.entries[2].errorSummary,
    },
    {
      decision: 'validation_failed',
      commandType: 'run',
      errorSummary: 'Invalid parameter syntax',
    },
  );

  assert.equal(eventLogs.entries[3].decision, 'confirmation_created');
  assert.equal(eventLogs.entries[3].taskId, 'echo');
  assert.ok(eventLogs.entries[3].confirmationId);
  assert.equal(eventLogs.entries[3].chatId, 'chat-logs-4');

  assert.equal(eventLogs.entries[4].eventType, 'card.action.trigger');
  assert.equal(eventLogs.entries[4].decision, 'run_started');
  assert.equal(eventLogs.entries[4].commandType, 'confirm_task');
  assert.equal(eventLogs.entries[4].confirmationId, confirmationId);
  assert.ok(eventLogs.entries[4].runId);

  assert.equal(eventLogs.entries[5].decision, 'confirmation_created');
  assert.equal(eventLogs.entries[5].taskId, 'echo');
  assert.equal(eventLogs.entries[5].confirmationId, cancelConfirmationId);

  assert.equal(eventLogs.entries[6].eventType, 'card.action.trigger');
  assert.equal(eventLogs.entries[6].decision, 'confirmation_cancelled');
  assert.equal(eventLogs.entries[6].commandType, 'cancel_confirmation');
  assert.equal(eventLogs.entries[6].confirmationId, cancelConfirmationId);

  const serializedLogs = JSON.stringify(eventLogs.entries);
  assert.ok(!serializedLogs.includes('super secret value'));
  assert.ok(!serializedLogs.includes('cancel me'));
  assert.ok(!serializedLogs.match(/\b\d{6}\b/u));

  await service.close();
});

test('runtime covers builtin, external, timeout, cancellation, and restart-safe lookup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-runtime-'));
  const databasePath = join(directory, 'runs.sqlite');

  let service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  const builtinConfirmation = service.submitTaskRequest('operator-1', 'echo', { message: 'builtin' });
  const builtinConfirmationId = JSON.parse(JSON.stringify(builtinConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const builtinRun = await service.confirmTaskRequest('operator-1', builtinConfirmationId);
  const builtinRunId = JSON.parse(JSON.stringify(builtinRun.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;
  await waitForState(service, 'operator-1', builtinRunId, 'succeeded');

  const externalConfirmation = service.submitTaskRequest('operator-1', 'external', {
    message: 'world',
  });
  const externalConfirmationId = JSON.parse(JSON.stringify(externalConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const externalRun = await service.confirmTaskRequest('operator-1', externalConfirmationId);
  const externalRunId = JSON.parse(JSON.stringify(externalRun.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;
  await waitForState(service, 'operator-1', externalRunId, 'succeeded');

  const timeoutConfirmation = service.submitTaskRequest('operator-1', 'slow', {});
  const timeoutConfirmationId = JSON.parse(JSON.stringify(timeoutConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const timeoutRun = await service.confirmTaskRequest('operator-1', timeoutConfirmationId);
  const timeoutRunId = JSON.parse(JSON.stringify(timeoutRun.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;
  await waitForState(service, 'operator-1', timeoutRunId, 'timed_out');

  const cancelConfirmation = service.submitTaskRequest('operator-1', 'cancel-slow', {});
  const cancelConfirmationId = JSON.parse(JSON.stringify(cancelConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const cancelRunCard = await service.confirmTaskRequest('operator-1', cancelConfirmationId);
  const cancelRunId = JSON.parse(JSON.stringify(cancelRunCard.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;
  await waitForState(service, 'operator-1', cancelRunId, 'running');
  await service.handleMessage('operator-1', `/cancel ${cancelRunId}`);
  await waitForState(service, 'operator-1', cancelRunId, 'cancelled');

  const nonCancellableConfirmation = service.submitTaskRequest('operator-1', 'never-cancel', {});
  const nonCancellableId = JSON.parse(JSON.stringify(nonCancellableConfirmation.card)).elements[0].content
    .match(/confirm_[\w-]+/u)?.[0]!;
  const nonCancellableRunCard = await service.confirmTaskRequest('operator-1', nonCancellableId);
  const nonCancellableRunId = JSON.parse(JSON.stringify(nonCancellableRunCard.card)).elements[0].content
    .match(/run_[\w-]+/u)?.[0]!;
  const nonCancellableCancel = await service.handleMessage(
    'operator-1',
    `/cancel ${nonCancellableRunId}`,
  );
  assert.ok(JSON.stringify(nonCancellableCancel.card).includes('not cancellable'));

  await service.close();

  service = new KidsAlfredService(createBotConfig('alpha', databasePath));
  const restored = service.getRunStatus('operator-1', builtinRunId);
  assert.ok(JSON.stringify(restored.card).includes(builtinRunId));

  await service.close();
});

test('builtin tasks resolve the CLI entrypoint independently of cwd', { concurrency: false }, async () => {
  const previousCwd = process.cwd();
  const unrelatedDirectory = await mkdtemp(join(tmpdir(), 'kids-alfred-runtime-cwd-'));
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-runtime-entrypoint-'));
  const databasePath = join(directory, 'runs.sqlite');
  const service = new KidsAlfredService(createBotConfig('alpha', databasePath));

  try {
    process.chdir(unrelatedDirectory);
    const confirmation = service.submitTaskRequest('operator-1', 'echo', { message: 'builtin' });
    const confirmationId = JSON.parse(JSON.stringify(confirmation.card)).elements[0].content
      .match(/confirm_[\w-]+/u)?.[0]!;
    const runCard = await service.confirmTaskRequest('operator-1', confirmationId);
    const runId = JSON.parse(JSON.stringify(runCard.card)).elements[0].content
      .match(/run_[\w-]+/u)?.[0]!;
    await waitForState(service, 'operator-1', runId, 'succeeded');
  } finally {
    process.chdir(previousCwd);
    await service.close();
  }
});
