import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from './test-compat.ts';

import type { RunRecord } from './domain.ts';
import { buildRunStatusCard } from './feishu/cards.ts';
import { formatFeishuTimestamp } from './feishu/timestamp.ts';
import {
  applyWebSocketLogEvent,
  createEventDispatcherHandlers,
  extractCardActionPayload,
  FeishuRunUpdateSink,
  FeishuTaskResultSink,
  processServiceHeartbeat,
  processServiceConnectionTransition,
} from './feishu/sdk.ts';

test('card action payload merges button values with top-level form values', () => {
  const action = extractCardActionPayload({
    action: {
      value: {
        type: 'submit_task',
        taskId: 'echo',
        parameters: {
          existing: 'keep-me',
        },
      },
    },
    form_value: {
      message: 'hello',
      retries: '2',
    },
  });

  assert.deepEqual(action, {
    type: 'submit_task',
    taskId: 'echo',
    parameters: {
      existing: 'keep-me',
      message: 'hello',
      retries: '2',
    },
    confirmationId: undefined,
    runId: undefined,
  });
});

test('card action payload also reads nested action form values', () => {
  const action = extractCardActionPayload({
    action: {
      value: {
        type: 'submit_task',
        taskId: 'echo',
      },
      form_value: {
        message: 'nested',
      },
    },
  });

  assert.equal(action.parameters?.message, 'nested');
});

test('event dispatcher handlers route card.action.trigger through card action handling', async () => {
  const calls: unknown[] = [];
  const service = {
    getBotId() {
      return 'alpha';
    },
    async handleMessage(): Promise<never> {
      throw new Error('message handler should not be used in this test');
    },
    async handleCardAction(actorId: string, action: unknown) {
      calls.push({ actorId, action });
      return {
        type: 'card' as const,
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: 'Updated',
            },
          },
          elements: [],
        },
      };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(): Promise<void> {
            throw new Error('message client should not be used in this test');
          },
        },
      },
    },
  };

  const handlers = createEventDispatcherHandlers(service as any, client as any);
  const response = await handlers['card.action.trigger']({
    operator: {
      operator_id: {
        open_id: 'ou_operator',
      },
    },
    action: {
      value: {
        type: 'confirm_task',
        confirmationId: 'confirm_123',
      },
    },
  });

  assert.deepEqual(calls, [
    {
      actorId: 'ou_operator',
      action: {
        type: 'confirm_task',
        taskId: undefined,
        parameters: undefined,
        confirmationId: 'confirm_123',
        runId: undefined,
      },
    },
  ]);
  assert.equal((response as any).header.title.content, 'Updated');
});

test('event dispatcher handlers read actor id from top-level card action event fields', async () => {
  const calls: unknown[] = [];
  const service = {
    getBotId() {
      return 'alpha';
    },
    async handleMessage(): Promise<never> {
      throw new Error('message handler should not be used in this test');
    },
    async handleCardAction(actorId: string, action: unknown) {
      calls.push({ actorId, action });
      return {
        type: 'card' as const,
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: 'Updated',
            },
          },
          elements: [],
        },
      };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(): Promise<void> {
            throw new Error('message client should not be used in this test');
          },
        },
      },
    },
  };

  const handlers = createEventDispatcherHandlers(service as any, client as any);
  await handlers['card.action.trigger']({
    open_id: 'ou_top_level',
    user_id: 'u_top_level',
    action: {
      value: {
        type: 'confirm_task',
        confirmationId: 'confirm_top',
      },
    },
  });

  assert.deepEqual(calls, [
    {
      actorId: 'ou_top_level',
      action: {
        type: 'confirm_task',
        taskId: undefined,
        parameters: undefined,
        confirmationId: 'confirm_top',
        runId: undefined,
      },
    },
  ]);
});

test('event dispatcher handlers suppress duplicate message deliveries', async () => {
  const handledTexts: string[] = [];
  const sentCards: string[] = [];
  const seenKeys = new Set<string>();
  const service = {
    getBotId() {
      return 'alpha';
    },
    claimIngressEvent(eventKey: string) {
      if (seenKeys.has(eventKey)) {
        return false;
      }
      seenKeys.add(eventKey);
      return true;
    },
    async logDuplicateIngress(): Promise<void> {},
    async handleMessage(_actorId: string, text: string) {
      handledTexts.push(text);
      return {
        type: 'card' as const,
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: `Reply ${text}`,
            },
          },
          elements: [],
        },
      };
    },
    async handleCardAction(): Promise<never> {
      throw new Error('card handler should not be used in this test');
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(request: any): Promise<void> {
            sentCards.push(request.data.content);
          },
        },
      },
    },
  };

  const handlers = createEventDispatcherHandlers(service as any, client as any);
  const payload = {
    header: { event_id: 'msg-1:duplicate' },
    sender: { sender_id: { open_id: 'ou_operator' } },
    message: { content: JSON.stringify({ text: '/cron list' }), chat_id: 'chat-1' },
  };

  await handlers['im.message.receive_v1'](payload);
  await handlers['im.message.receive_v1'](payload);

  assert.deepEqual(handledTexts, ['/cron list']);
  assert.equal(sentCards.length, 1);
});

test('event dispatcher handlers suppress duplicate card actions', async () => {
  const actions: string[] = [];
  const seenKeys = new Set<string>();
  const service = {
    getBotId() {
      return 'alpha';
    },
    claimIngressEvent(eventKey: string) {
      if (seenKeys.has(eventKey)) {
        return false;
      }
      seenKeys.add(eventKey);
      return true;
    },
    async logDuplicateIngress(): Promise<void> {},
    async handleMessage(): Promise<never> {
      throw new Error('message handler should not be used in this test');
    },
    async handleCardAction(_actorId: string, action: any) {
      actions.push(action.confirmationId);
      return {
        type: 'card' as const,
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: 'Updated',
            },
          },
          elements: [],
        },
      };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(): Promise<void> {
            throw new Error('message client should not be used in this test');
          },
        },
      },
    },
  };

  const handlers = createEventDispatcherHandlers(service as any, client as any);
  const payload = {
    action: {
      value: {
        type: 'confirm_task',
        confirmationId: 'confirm-1',
      },
    },
  };

  const first = await handlers['card.action.trigger'](payload);
  const second = await handlers['card.action.trigger'](payload);

  assert.deepEqual(actions, ['confirm-1']);
  assert.equal((first as any).header.title.content, 'Updated');
  assert.equal(second, undefined);
});

test('FeishuTaskResultSink uploads origin-chat images and deletes them after successful delivery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-feishu-image-'));
  const screenshotPath = join(directory, 'screenshot.png');
  await writeFile(screenshotPath, 'fake-image');

  const uploads: string[] = [];
  const messages: any[] = [];
  const sink = new FeishuTaskResultSink(
    {
      im: {
        v1: {
          image: {
            async create(request: any) {
              uploads.push(request.data.image?.imagePath ?? 'stream');
              return { image_key: 'img_v2_123' };
            },
          },
          message: {
            async create(request: any) {
              messages.push(request);
            },
          },
        },
      },
    } as any,
    {
      openImage: (path) => ({ imagePath: path }),
    },
  );

  await sink.sendTaskResult(
    {
      runId: 'run_sc_1',
      taskId: 'sc',
      taskType: 'builtin-tool',
      actorId: 'operator-1',
      confirmationId: 'confirm_sc_1',
      state: 'running',
      parameters: {},
      parameterSummary: 'n/a',
      createdAt: '2026-03-15T10:00:00.000Z',
      updatedAt: '2026-03-15T10:00:01.000Z',
      originChatId: 'oc_chat_sc',
      cancellable: false,
    },
    {
      id: 'sc',
      runnerKind: 'builtin-tool',
      executionMode: 'oneshot',
      description: 'Capture screen',
      tool: 'screencapture',
      timeoutMs: 30000,
      cancellable: false,
      parameters: {},
    },
    {
      summary: 'Screen captured',
      artifacts: [
        {
          channel: 'feishu',
          kind: 'origin-chat-image',
          path: screenshotPath,
          deleteAfterDelivery: true,
        },
      ],
    },
  );

  assert.deepEqual(uploads, [screenshotPath]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].data.msg_type, 'image');
  assert.equal(messages[0].data.receive_id, 'oc_chat_sc');
  assert.equal(messages[0].data.content, JSON.stringify({ image_key: 'img_v2_123' }));
  await assert.rejects(() => stat(screenshotPath));
});

test('FeishuTaskResultSink retains image files when Feishu delivery fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-feishu-image-failure-'));
  const screenshotPath = join(directory, 'screenshot.png');
  await writeFile(screenshotPath, 'fake-image');

  const sink = new FeishuTaskResultSink(
    {
      im: {
        v1: {
          image: {
            async create() {
              return { image_key: 'img_v2_456' };
            },
          },
          message: {
            async create() {
              throw new Error('delivery blocked');
            },
          },
        },
      },
    } as any,
    {
      openImage: (path) => ({ imagePath: path }),
    },
  );

  await assert.rejects(
    () =>
      sink.sendTaskResult(
        {
          runId: 'run_sc_2',
          taskId: 'sc',
          taskType: 'builtin-tool',
          actorId: 'operator-1',
          confirmationId: 'confirm_sc_2',
          state: 'running',
          parameters: {},
          parameterSummary: 'n/a',
          createdAt: '2026-03-15T10:00:00.000Z',
          updatedAt: '2026-03-15T10:00:01.000Z',
          originChatId: 'oc_chat_sc',
          cancellable: false,
        },
        {
          id: 'sc',
          runnerKind: 'builtin-tool',
          executionMode: 'oneshot',
          description: 'Capture screen',
          tool: 'screencapture',
          timeoutMs: 30000,
          cancellable: false,
          parameters: {},
        },
        {
          summary: 'Screen captured',
          artifacts: [
            {
              channel: 'feishu',
              kind: 'origin-chat-image',
              path: screenshotPath,
              deleteAfterDelivery: true,
            },
          ],
        },
      ),
    /delivery blocked/u,
  );

  assert.equal((await stat(screenshotPath)).isFile(), true);
});

test('run status cards normalize long summaries and include canonical fields', () => {
  const run: RunRecord = {
    runId: 'run_123',
    taskId: 'echo',
    taskType: 'builtin-tool',
    actorId: 'ou_operator',
    confirmationId: 'confirm_123',
    state: 'failed',
    parameters: {},
    parameterSummary: 'none',
    createdAt: '2026-03-12T10:00:00.000Z',
    updatedAt: '2026-03-12T10:02:00.000Z',
    startedAt: '2026-03-12T10:01:00.000Z',
    finishedAt: '2026-03-12T10:02:00.000Z',
    statusSummary: 'x'.repeat(400),
    cancellable: false,
  };

  const card = buildRunStatusCard(run);
  const json = JSON.stringify(card.card);
  assert.ok(json.includes('Run ID'));
  assert.ok(json.includes('Started At'));
  assert.ok(json.includes('Finished At'));
  assert.ok(json.includes(formatFeishuTimestamp('2026-03-12T10:01:00.000Z')));
  assert.ok(json.includes(formatFeishuTimestamp('2026-03-12T10:02:00.000Z')));
  assert.ok(!json.includes('2026-03-12T10:01:00.000Z'));
  assert.ok(json.includes('...'));
  assert.ok(!json.includes('x'.repeat(320)));
});

test('feishu run update sink pushes milestone states and ignores delivery failures', async () => {
  const deliveries: Array<{ chatId: string; title: string }> = [];
  const sink = new FeishuRunUpdateSink(async (chatId, card) => {
    const title = (card as any).header?.title?.content;
    deliveries.push({ chatId, title });
    if (title === 'Run run_terminal_fail') {
      throw new Error('push failed');
    }
  });

  const baseRun: RunRecord = {
    runId: 'run_running',
    taskId: 'echo',
    taskType: 'builtin-tool',
    actorId: 'ou_operator',
    confirmationId: 'confirm_123',
    state: 'queued',
    parameters: {},
    parameterSummary: 'none',
    createdAt: '2026-03-12T10:00:00.000Z',
    updatedAt: '2026-03-12T10:00:00.000Z',
    statusSummary: 'Run queued',
    originChatId: 'chat-1',
    cancellable: true,
  };

  await sink.sendRunUpdate(baseRun);
  await sink.sendRunUpdate({
    ...baseRun,
    runId: 'run_running',
    state: 'running',
    startedAt: '2026-03-12T10:01:00.000Z',
    statusSummary: 'Task started',
  });
  await sink.sendRunUpdate({
    ...baseRun,
    runId: 'run_terminal_fail',
    state: 'failed',
    startedAt: '2026-03-12T10:01:00.000Z',
    finishedAt: '2026-03-12T10:02:00.000Z',
    statusSummary: 'failure summary',
  });

  assert.deepEqual(deliveries, [
    { chatId: 'chat-1', title: 'Run run_running' },
    { chatId: 'chat-1', title: 'Run run_terminal_fail' },
  ]);
});

test('feishu run update sink logs delivery failures with run context', async () => {
  const originalError = console.error;
  const errorCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  try {
    const sink = new FeishuRunUpdateSink(async () => {
      throw new Error('network unreachable');
    });

    await sink.sendRunUpdate({
      runId: 'run_push_fail',
      taskId: 'echo',
      taskType: 'builtin-tool',
      actorId: 'ou_operator',
      confirmationId: 'confirm_123',
      state: 'failed',
      parameters: {},
      parameterSummary: 'none',
      createdAt: '2026-03-12T10:00:00.000Z',
      updatedAt: '2026-03-12T10:02:00.000Z',
      startedAt: '2026-03-12T10:01:00.000Z',
      finishedAt: '2026-03-12T10:02:00.000Z',
      statusSummary: 'failure summary',
      originChatId: 'chat-1',
      cancellable: true,
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(errorCalls.length, 1);
  const log = JSON.stringify(errorCalls[0]);
  assert.ok(log.includes('feishu_run_update_delivery_failed'));
  assert.ok(log.includes('run_push_fail'));
  assert.ok(log.includes('chat-1'));
  assert.ok(log.includes('network unreachable'));
});

test('websocket health transitions track reconnect failures and successful recovery', () => {
  const base = {
    state: 'disconnected' as const,
    consecutiveReconnectFailures: 0,
    fallbackEventPath: '/bots/alpha/webhook/event',
  };

  const reconnecting = applyWebSocketLogEvent(base, 'info', ['[ws]', 'reconnect']);
  assert.equal(reconnecting.state, 'reconnecting');

  const failed = applyWebSocketLogEvent(reconnecting, 'error', ['[ws]', 'connect failed']);
  assert.equal(failed.consecutiveReconnectFailures, 1);
  assert.match(failed.lastError ?? '', /connect failed/u);

  const recovered = applyWebSocketLogEvent(failed, 'info', ['[ws]', 'ws client ready'], {
    now: '2026-03-12T12:00:00.000Z',
  });
  assert.equal(recovered.state, 'connected');
  assert.equal(recovered.consecutiveReconnectFailures, 0);
  assert.equal(recovered.lastConnectedAt, '2026-03-12T12:00:00.000Z');
  assert.equal(recovered.lastError, undefined);
});

test('websocket health ignores reconnect transition after manual close', () => {
  const base = {
    state: 'disconnected' as const,
    consecutiveReconnectFailures: 2,
    fallbackEventPath: '/bots/alpha/webhook/event',
  };

  const afterClose = applyWebSocketLogEvent(base, 'info', ['[ws]', 'reconnect'], {
    manuallyClosed: true,
  });
  assert.equal(afterClose.state, 'disconnected');
  assert.equal(afterClose.consecutiveReconnectFailures, 2);
});

test('service connection transition emits a session-scoped online notification to allowlist subscribers', async () => {
  const deliveries: any[] = [];
  const serviceState: any = {};
  const subscriptions = {
    service_online: ['ou_a', 'ou_b'],
    service_reconnected: ['ou_a'],
  };
  const service = {
    getBotId() {
      return 'alpha';
    },
    getConfig() {
      return {
        loadedAt: '2026-03-15T01:00:00.000Z',
      };
    },
    getServiceReconnectNotificationThresholdMs() {
      return 3600000;
    },
    listServiceEventSubscriberActorIds(eventType: 'service_online' | 'service_reconnected') {
      return subscriptions[eventType];
    },
    getServiceEventState() {
      return Object.keys(serviceState).length > 0 ? serviceState : undefined;
    },
    saveServiceEventState(update: any) {
      for (const [key, value] of Object.entries(update)) {
        if (value === null) {
          delete serviceState[key];
        } else {
          serviceState[key] = value;
        }
      }
      serviceState.updatedAt = '2026-03-15T01:05:00.000Z';
      return { ...serviceState };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(request: any) {
            deliveries.push(request);
          },
        },
      },
    },
  };

  let onlineNotificationSent = false;
  onlineNotificationSent = await processServiceConnectionTransition(
    service as any,
    client as any,
    {
      state: 'connecting',
      consecutiveReconnectFailures: 0,
    },
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
      lastConnectedAt: '2026-03-15T01:05:00.000Z',
    },
    '2026-03-15T01:05:00.000Z',
    onlineNotificationSent,
  );
  onlineNotificationSent = await processServiceConnectionTransition(
    service as any,
    client as any,
    {
      state: 'reconnecting',
      consecutiveReconnectFailures: 1,
    },
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
      lastConnectedAt: '2026-03-15T01:06:00.000Z',
    },
    '2026-03-15T01:06:00.000Z',
    onlineNotificationSent,
  );

  assert.equal(onlineNotificationSent, true);
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].params.receive_id_type, 'open_id');
  assert.equal(deliveries[0].data.receive_id, 'ou_a');
  assert.equal(deliveries[1].data.receive_id, 'ou_b');
  assert.ok(deliveries[0].data.content.includes('Bot 已上线'));
});

test('service heartbeat uses a 1 hour default threshold for reconnect notifications', async () => {
  const deliveries: any[] = [];
  const serviceState: any = {};
  const service = {
    getBotId() {
      return 'alpha';
    },
    getConfig() {
      return {
        loadedAt: '2026-03-15T00:55:00.000Z',
      };
    },
    getServiceReconnectNotificationThresholdMs() {
      return 3600000;
    },
    listServiceEventSubscriberActorIds(eventType: 'service_online' | 'service_reconnected') {
      return eventType === 'service_reconnected' ? ['ou_a'] : [];
    },
    getServiceEventState() {
      return { ...serviceState };
    },
    saveServiceEventState(update: any) {
      for (const [key, value] of Object.entries(update)) {
        if (value === null) {
          delete serviceState[key];
        } else {
          serviceState[key] = value;
        }
      }
      serviceState.updatedAt = '2026-03-15T01:06:00.000Z';
      return { ...serviceState };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(request: any) {
            deliveries.push(request);
          },
        },
      },
    },
  };

  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:00:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
    } as any,
  );
  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:06:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
      lastConnectedAt: '2026-03-15T01:06:00.000Z',
    } as any,
  );
  assert.equal(deliveries.length, 0);

  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:00:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
    } as any,
  );
  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T02:10:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
      lastConnectedAt: '2026-03-15T02:10:00.000Z',
    } as any,
  );

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].params.receive_id_type, 'open_id');
  assert.equal(deliveries[0].data.receive_id, 'ou_a');
  assert.ok(deliveries[0].data.content.includes('Bot 已恢复连接'));
  assert.ok(deliveries[0].data.content.includes('1小时10分'));
  assert.equal(serviceState.lastHeartbeatSucceededAt, '2026-03-15T02:10:00.000Z');
  assert.equal(serviceState.lastReconnectedNotifiedAt, '2026-03-15T02:10:00.000Z');
});

test('service heartbeat respects explicit global reconnect threshold overrides', async () => {
  const deliveries: any[] = [];
  const serviceState: any = {};
  const service = {
    getBotId() {
      return 'alpha';
    },
    getConfig() {
      return {
        loadedAt: '2026-03-15T00:55:00.000Z',
      };
    },
    getServiceReconnectNotificationThresholdMs() {
      return 120000;
    },
    listServiceEventSubscriberActorIds(eventType: 'service_online' | 'service_reconnected') {
      return eventType === 'service_reconnected' ? ['ou_a'] : [];
    },
    getServiceEventState() {
      return { ...serviceState };
    },
    saveServiceEventState(update: any) {
      for (const [key, value] of Object.entries(update)) {
        if (value === null) {
          delete serviceState[key];
        } else {
          serviceState[key] = value;
        }
      }
      serviceState.updatedAt = '2026-03-15T01:02:00.000Z';
      return { ...serviceState };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(request: any) {
            deliveries.push(request);
          },
        },
      },
    },
  };

  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:00:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
    } as any,
  );
  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:02:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
      lastConnectedAt: '2026-03-15T01:02:00.000Z',
    } as any,
  );

  assert.equal(deliveries.length, 1);
  assert.ok(deliveries[0].data.content.includes('2分'));
});

test('service heartbeat skips persistence and notifications while the bot is not connected', async () => {
  const deliveries: any[] = [];
  const serviceState: any = {};
  const service = {
    getBotId() {
      return 'alpha';
    },
    getConfig() {
      return {
        loadedAt: '2026-03-15T00:55:00.000Z',
      };
    },
    getServiceReconnectNotificationThresholdMs() {
      return 300000;
    },
    listServiceEventSubscriberActorIds(eventType: 'service_online' | 'service_reconnected') {
      return eventType === 'service_reconnected' ? ['ou_a'] : [];
    },
    getServiceEventState() {
      return { ...serviceState };
    },
    saveServiceEventState(update: any) {
      for (const [key, value] of Object.entries(update)) {
        if (value === null) {
          delete serviceState[key];
        } else {
          serviceState[key] = value;
        }
      }
      serviceState.updatedAt = '2026-03-15T01:06:00.000Z';
      return { ...serviceState };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(request: any) {
            deliveries.push(request);
          },
        },
      },
    },
  };

  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:06:00.000Z',
    {
      state: 'reconnecting',
      consecutiveReconnectFailures: 0,
    } as any,
  );

  assert.equal(deliveries.length, 0);
  assert.deepEqual(serviceState, {});
});

test('service heartbeat treats recent webhook fallback as recovered availability in fallback mode', async () => {
  const deliveries: any[] = [];
  const serviceState: any = {};
  const service = {
    getBotId() {
      return 'alpha';
    },
    getConfig() {
      return {
        loadedAt: '2026-03-15T00:55:00.000Z',
      };
    },
    getIngressMode() {
      return 'websocket-with-webhook-fallback';
    },
    getServiceReconnectNotificationThresholdMs() {
      return 120000;
    },
    listServiceEventSubscriberActorIds(eventType: 'service_online' | 'service_reconnected') {
      return eventType === 'service_reconnected' ? ['ou_a'] : [];
    },
    getServiceEventState() {
      return { ...serviceState };
    },
    saveServiceEventState(update: any) {
      for (const [key, value] of Object.entries(update)) {
        if (value === null) {
          delete serviceState[key];
        } else {
          serviceState[key] = value;
        }
      }
      serviceState.updatedAt = '2026-03-15T01:02:00.000Z';
      return { ...serviceState };
    },
    getWebhookObservation() {
      return {
        enabled: true,
        configured: true,
        lastEventReceivedAt: '2026-03-15T01:02:00.000Z',
        lastEventType: 'im.message.receive_v1',
        stale: false,
      };
    },
  };
  const client = {
    im: {
      v1: {
        message: {
          async create(request: any) {
            deliveries.push(request);
          },
        },
      },
    },
  };

  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:00:00.000Z',
    {
      state: 'connected',
      consecutiveReconnectFailures: 0,
    } as any,
  );

  await processServiceHeartbeat(
    service as any,
    client as any,
    '2026-03-15T01:02:00.000Z',
    {
      state: 'reconnecting',
      consecutiveReconnectFailures: 0,
    } as any,
  );

  assert.equal(deliveries.length, 1);
  assert.ok(deliveries[0].data.content.includes('Bot 已恢复连接'));
  assert.ok(deliveries[0].data.content.includes('2分'));
  assert.ok(deliveries[0].data.content.includes('webhook'));
  assert.equal(serviceState.lastHeartbeatSucceededAt, '2026-03-15T01:02:00.000Z');
  assert.equal(serviceState.lastReconnectedNotifiedAt, '2026-03-15T01:02:00.000Z');
});
