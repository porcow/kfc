import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { hostname } from 'node:os';

import type {
  BotWebSocketHealth,
  RunRecord,
  RunUpdateSink,
  ServiceEventType,
  TaskDefinition,
  TaskResult,
  TaskResultArtifact,
  TaskResultDeliverySink,
} from '../domain.ts';
import type { KidsAlfredService } from '../service.ts';
import { buildRunStatusCard, buildServiceEventNotificationCard } from './cards.ts';

interface RequestHandler {
  (request: IncomingMessage, response: ServerResponse): void;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseMessageText(payload: unknown): string {
  if (typeof payload !== 'string' || !payload.trim()) {
    return '';
  }

  try {
    const parsed = JSON.parse(payload) as { text?: unknown };
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    return payload;
  }
}

function extractActorId(payload: any): string {
  return (
    payload?.open_id ??
    payload?.user_id ??
    payload?.operator_user_id?.open_id ??
    payload?.operator_user_id?.user_id ??
    payload?.user?.open_id ??
    payload?.user?.user_id ??
    payload?.user_id?.open_id ??
    payload?.user_id?.user_id ??
    payload?.operator?.operator_id?.open_id ??
    payload?.operator?.operator_id?.user_id ??
    payload?.sender?.sender_id?.open_id ??
    payload?.sender?.sender_id?.user_id ??
    ''
  );
}

function describeCardActionActorFields(payload: any): Record<string, unknown> {
  return {
    topLevelOpenId: payload?.open_id,
    topLevelUserId: payload?.user_id,
    operatorId: payload?.operator_id,
    operatorUserIdOpenId: payload?.operator_user_id?.open_id,
    operatorUserIdUserId: payload?.operator_user_id?.user_id,
    userOpenId: payload?.user?.open_id,
    userUserId: payload?.user?.user_id,
    nestedUserIdOpenId: payload?.user_id?.open_id,
    nestedUserIdUserId: payload?.user_id?.user_id,
    operatorOpenId: payload?.operator?.operator_id?.open_id,
    operatorUserIdNested: payload?.operator?.operator_id?.user_id,
    senderOpenId: payload?.sender?.sender_id?.open_id,
    senderUserId: payload?.sender?.sender_id?.user_id,
    hasSchema: Boolean(payload?.schema),
    hasHeader: Boolean(payload?.header),
    hasEvent: Boolean(payload?.event),
    confirmationId: payload?.action?.value?.confirmationId,
    actionTag: payload?.action?.tag,
    actionType: payload?.action?.value?.type,
  };
}

export function extractCardActionPayload(event: any): {
  type: string;
  taskId?: string;
  parameters?: Record<string, unknown>;
  confirmationId?: string;
  runId?: string;
} {
  const actionValue = toRecord(event?.action?.value);
  const parameters = {
    ...toRecord(actionValue.parameters),
    ...toRecord(event?.action?.form_value),
    ...toRecord(event?.form_value),
  };

  return {
    type: typeof actionValue.type === 'string' ? actionValue.type : '',
    taskId: typeof actionValue.taskId === 'string' ? actionValue.taskId : undefined,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    confirmationId:
      typeof actionValue.confirmationId === 'string' ? actionValue.confirmationId : undefined,
    runId: typeof actionValue.runId === 'string' ? actionValue.runId : undefined,
  };
}

export interface BotBridge {
  botId: string;
  cardPath: string;
  eventPath: string;
  cardHandler: RequestHandler;
  eventHandler: RequestHandler;
  startWebSocketClient(): Promise<void>;
  close(): Promise<void>;
  getWebSocketHealth(): BotWebSocketHealth;
}

interface ReplyClient {
  im: {
    v1: {
      image: {
        create(request: {
          data: {
            image_type: string;
            image: unknown;
          };
        }): Promise<{
          image_key?: string;
        } | null>;
      };
      message: {
        create(request: {
          params: {
            receive_id_type: string;
          };
          data: {
            receive_id: string;
            content: string;
            msg_type: string;
          };
        }): Promise<unknown>;
      };
    };
  };
}

type IngressAwareService = Pick<
  KidsAlfredService,
  'handleMessage' | 'handleCardAction' | 'getBotId'
> &
  Partial<{
    claimIngressEvent(eventKey: string, eventType: string): boolean | Promise<boolean>;
    logDuplicateIngress(entry: {
      actorId: string;
      eventType: 'im.message.receive_v1' | 'card.action.trigger';
      commandType: string;
      chatId?: string;
      taskId?: string;
      runId?: string;
      confirmationId?: string;
    }): Promise<void>;
  }>;

type ServiceEventAwareService = KidsAlfredService &
  Pick<
    KidsAlfredService,
    | 'listServiceEventSubscriberActorIds'
    | 'getServiceEventState'
    | 'saveServiceEventState'
    | 'getServiceReconnectNotificationThresholdMs'
    | 'getConfig'
    | 'getBotId'
  >;

interface MessageTarget {
  receiveIdType: 'chat_id' | 'open_id';
  receiveId: string;
}

const RECONNECT_WARNING_THRESHOLD = 3;

function stringifyLogMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function nextReconnectAt(wsClient: any): string | undefined {
  if (!wsClient || typeof wsClient.getReconnectInfo !== 'function') {
    return undefined;
  }
  const reconnectInfo = wsClient.getReconnectInfo() as { nextConnectTime?: number } | undefined;
  if (!reconnectInfo?.nextConnectTime) {
    return undefined;
  }
  return new Date(reconnectInfo.nextConnectTime).toISOString();
}

function withWarning(health: BotWebSocketHealth): BotWebSocketHealth {
  if (health.consecutiveReconnectFailures >= RECONNECT_WARNING_THRESHOLD) {
    return {
      ...health,
      warning: `WebSocket reconnect failures exceeded ${RECONNECT_WARNING_THRESHOLD}. Consider switching bot event delivery to ${health.fallbackEventPath}.`,
    };
  }
  return {
    ...health,
    warning: undefined,
  };
}

export function applyWebSocketLogEvent(
  health: BotWebSocketHealth,
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace',
  messages: unknown[],
  options: { manuallyClosed?: boolean; now?: string } = {},
): BotWebSocketHealth {
  const manuallyClosed = options.manuallyClosed ?? false;
  const now = options.now ?? new Date().toISOString();
  const text = messages.map(stringifyLogMessage).join(' ');

  if (
    level === 'info' &&
    text.includes('ws client ready') ||
    level === 'debug' && text.includes('ws connect success')
  ) {
    return {
      ...health,
      state: 'connected',
      lastConnectedAt: now,
      lastError: undefined,
      consecutiveReconnectFailures: 0,
      nextReconnectAt: undefined,
    };
  }

  if (level === 'info' && text.includes('reconnect') && !manuallyClosed) {
    return {
      ...health,
      state: 'reconnecting',
    };
  }

  if (level === 'debug' && text.includes('client closed') && !manuallyClosed) {
    return {
      ...health,
      state: 'reconnecting',
    };
  }

  if (level === 'error' && text.includes('connect failed') && !text.includes('ws connect failed')) {
    return {
      ...health,
      state: 'reconnecting',
      lastError: text,
      consecutiveReconnectFailures: health.consecutiveReconnectFailures + 1,
    };
  }

  if (level === 'error' && text.includes('ws error')) {
    return {
      ...health,
      lastError: text,
    };
  }

  return health;
}

async function sendInteractiveCard(
  client: ReplyClient,
  target: MessageTarget,
  card: Record<string, unknown>,
): Promise<void> {
  await client.im.v1.message.create({
    params: {
      receive_id_type: target.receiveIdType,
    },
    data: {
      receive_id: target.receiveId,
      content: JSON.stringify(card),
      msg_type: 'interactive',
    },
  });
}

function isPushMilestoneState(state: RunRecord['state']): boolean {
  return ['running', 'succeeded', 'failed', 'timed_out', 'cancelled'].includes(state);
}

export class FeishuRunUpdateSink implements RunUpdateSink {
  private readonly sender: (chatId: string, card: Record<string, unknown>) => Promise<void>;

  constructor(sender: (chatId: string, card: Record<string, unknown>) => Promise<void>) {
    this.sender = sender;
  }

  async sendRunUpdate(run: RunRecord): Promise<void> {
    if (!run.originChatId || !isPushMilestoneState(run.state)) {
      return;
    }

    try {
      await this.sender(run.originChatId, buildRunStatusCard(run).card);
    } catch (error) {
      console.error(
        JSON.stringify({
          logType: 'feishu_run_update_delivery_failed',
          runId: run.runId,
          taskId: run.taskId,
          state: run.state,
          chatId: run.originChatId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      // Delivery failures must not affect persisted run state.
    }
  }
}

interface FeishuTaskResultSinkOptions {
  unlink?: typeof unlink;
  openImage?: (path: string) => unknown;
}

async function sendFeishuImage(
  client: ReplyClient,
  chatId: string,
  imagePath: string,
  openImage: (path: string) => unknown,
): Promise<void> {
  const upload = await client.im.v1.image.create({
    data: {
      image_type: 'message',
      image: openImage(imagePath),
    },
  });
  const imageKey = upload?.image_key;
  if (!imageKey) {
    throw new Error(`Feishu image upload did not return image_key for ${imagePath}`);
  }
  await client.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: chatId,
      content: JSON.stringify({ image_key: imageKey }),
      msg_type: 'image',
    },
  });
}

async function sendServiceEventNotification(
  client: ReplyClient,
  service: ServiceEventAwareService,
  eventType: ServiceEventType,
  connectedAt: string,
  options: { heartbeatGapMs?: number } = {},
): Promise<void> {
  const actorIds = service.listServiceEventSubscriberActorIds(eventType);
  if (actorIds.length === 0) {
    return;
  }
  const card = buildServiceEventNotificationCard({
    eventType,
    botId: service.getBotId(),
    connectedAt,
    host: hostname(),
    loadedAt: service.getConfig().loadedAt,
    heartbeatGapMs: options.heartbeatGapMs,
  });
  for (const actorId of actorIds) {
    await sendInteractiveCard(
      client,
      {
        receiveIdType: 'open_id',
        receiveId: actorId,
      },
      card,
    ).catch((error) => {
      console.error(
        JSON.stringify({
          logType: 'service_event_notification_delivery_failed',
          botId: service.getBotId(),
          actorId,
          eventType,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }
}

function isConnectedState(state: BotWebSocketHealth['state']): boolean {
  return state === 'connected';
}

export async function processServiceConnectionTransition(
  service: ServiceEventAwareService,
  client: ReplyClient,
  previousHealth: BotWebSocketHealth,
  nextHealth: BotWebSocketHealth,
  now: string,
  onlineNotificationSent: boolean,
): Promise<boolean> {
  if (previousHealth.state === nextHealth.state) {
    return onlineNotificationSent;
  }

  if (!isConnectedState(nextHealth.state)) {
    return onlineNotificationSent;
  }

  service.saveServiceEventState(
    {
      lastConnectedAt: now,
    },
    now,
  );

  let nextOnlineNotificationSent = onlineNotificationSent;
  if (!nextOnlineNotificationSent) {
    nextOnlineNotificationSent = true;
    await sendServiceEventNotification(client, service, 'service_online', now);
  }
  return nextOnlineNotificationSent;
}

export async function processServiceHeartbeat(
  service: ServiceEventAwareService,
  client: ReplyClient,
  now: string,
  currentHealth: BotWebSocketHealth,
): Promise<void> {
  if (!isConnectedState(currentHealth.state)) {
    return;
  }

  const state = service.getServiceEventState();
  const previousHeartbeatSucceededAt = state?.lastHeartbeatSucceededAt;
  service.saveServiceEventState(
    {
      lastConnectedAt: currentHealth.lastConnectedAt ?? now,
      lastHeartbeatSucceededAt: now,
    },
    now,
  );

  if (!previousHeartbeatSucceededAt) {
    return;
  }

  const heartbeatGapMs = new Date(now).valueOf() - new Date(previousHeartbeatSucceededAt).valueOf();
  if (heartbeatGapMs < service.getServiceReconnectNotificationThresholdMs()) {
    return;
  }

  await sendServiceEventNotification(client, service, 'service_reconnected', now, {
    heartbeatGapMs,
  });
  service.saveServiceEventState(
    {
      lastConnectedAt: currentHealth.lastConnectedAt ?? now,
      lastHeartbeatSucceededAt: now,
      lastReconnectedNotifiedAt: now,
    },
    now,
  );
}

export class FeishuTaskResultSink implements TaskResultDeliverySink {
  private readonly client: ReplyClient;
  private readonly unlinkImpl: typeof unlink;
  private readonly openImage: (path: string) => unknown;

  constructor(client: ReplyClient, options: FeishuTaskResultSinkOptions = {}) {
    this.client = client;
    this.unlinkImpl = options.unlink ?? unlink;
    this.openImage = options.openImage ?? ((path: string) => createReadStream(path));
  }

  async sendTaskResult(run: RunRecord, _task: TaskDefinition, result: TaskResult): Promise<void> {
    for (const artifact of result.artifacts ?? []) {
      await this.deliverArtifact(run, artifact);
    }
  }

  private async deliverArtifact(run: RunRecord, artifact: TaskResultArtifact): Promise<void> {
    if (artifact.channel !== 'feishu' || artifact.kind !== 'origin-chat-image') {
      return;
    }
    if (!run.originChatId) {
      throw new Error(`Run ${run.runId} is missing origin chat context for Feishu image delivery`);
    }
    await sendFeishuImage(this.client, run.originChatId, artifact.path, this.openImage);
    if (artifact.deleteAfterDelivery === false) {
      return;
    }
    await this.unlinkImpl(artifact.path).catch((error) => {
      console.error(
        JSON.stringify({
          logType: 'feishu_artifact_cleanup_failed',
          runId: run.runId,
          path: artifact.path,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }
}

function extractStableEventId(payload: any): string | undefined {
  const candidates = [
    payload?.header?.event_id,
    payload?.event_id,
    payload?.event?.event_id,
    payload?.message_id,
    payload?.message?.message_id,
  ];
  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
}

function detectMessageCommandType(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '/help') {
    return 'help';
  }
  if (trimmed === '/health') {
    return 'health';
  }
  if (trimmed === '/tasks') {
    return 'tasks';
  }
  if (trimmed.startsWith('/run ')) {
    return 'run';
  }
  if (trimmed === '/cron list') {
    return 'cron_list';
  }
  if (trimmed === '/cron status') {
    return 'cron_status';
  }
  if (trimmed.startsWith('/cron start ')) {
    return 'cron_start';
  }
  if (trimmed.startsWith('/cron stop ')) {
    return 'cron_stop';
  }
  if (trimmed.startsWith('/run-status ')) {
    return 'run_status';
  }
  if (trimmed.startsWith('/cancel ')) {
    return 'cancel_run';
  }
  if (trimmed === '/reload') {
    return 'reload';
  }
  return 'unknown';
}

function buildMessageIngressKey(service: Pick<KidsAlfredService, 'getBotId'>, data: any, text: string, actorId: string, chatId: string): string {
  const stableEventId = extractStableEventId(data);
  if (stableEventId) {
    return `im.message.receive_v1:${stableEventId}`;
  }
  const messageTimestamp =
    data?.message?.create_time ??
    data?.event?.message?.create_time ??
    data?.create_time ??
    data?.ts ??
    '';
  return `im.message.receive_v1:${service.getBotId()}:${chatId}:${actorId}:${messageTimestamp}:${text}`;
}

function buildCardActionIngressKey(service: Pick<KidsAlfredService, 'getBotId'>, data: any, actorId: string, action: ReturnType<typeof extractCardActionPayload>): string {
  const stableEventId = extractStableEventId(data);
  if (stableEventId) {
    return `card.action.trigger:${stableEventId}`;
  }
  return `card.action.trigger:${service.getBotId()}:${action.confirmationId ?? action.runId ?? action.taskId ?? 'unknown'}:${action.type}:${actorId}`;
}

export function createEventDispatcherHandlers(
  service: IngressAwareService,
  client: ReplyClient,
): Record<string, (data: any) => Promise<unknown>> {
  return {
    'im.message.receive_v1': async (data: any) => {
      const actorId = extractActorId(data);
      const text = parseMessageText(data?.message?.content ?? '');
      const chatId = typeof data?.message?.chat_id === 'string' ? data.message.chat_id : '';
      const commandType = detectMessageCommandType(text);
      const eventKey = buildMessageIngressKey(service, data, text, actorId, chatId);
      if (service.claimIngressEvent && !(await service.claimIngressEvent(eventKey, 'im.message.receive_v1'))) {
        await service.logDuplicateIngress?.({
          actorId,
          chatId: chatId || undefined,
          eventType: 'im.message.receive_v1',
          commandType,
        });
        return;
      }
      const reply = await service.handleMessage(actorId, text, {
        chatId: chatId || undefined,
      });
      if (chatId) {
        await sendInteractiveCard(
          client,
          {
            receiveIdType: 'chat_id',
            receiveId: chatId,
          },
          reply.card,
        );
      }
    },
    'card.action.trigger': async (data: any) => {
      const actorId = extractActorId(data);
      const action = extractCardActionPayload(data);
      const eventKey = buildCardActionIngressKey(service, data, actorId, action);
      if (service.claimIngressEvent && !(await service.claimIngressEvent(eventKey, 'card.action.trigger'))) {
        await service.logDuplicateIngress?.({
          actorId,
          eventType: 'card.action.trigger',
          commandType: action.type || 'unknown',
          taskId: action.taskId,
          runId: action.runId,
          confirmationId: action.confirmationId,
        });
        return undefined;
      }
      if (!actorId) {
        console.warn(
          JSON.stringify({
            logType: 'feishu_card_action_actor_missing',
            fields: describeCardActionActorFields(data),
          }),
        );
      }
      const response = await service.handleCardAction(actorId, action);
      return response.card;
    },
  };
}

function loadSdkErrorHint(error: unknown): Error {
  const cause = error instanceof Error ? error.message : String(error);
  return new Error(
    `Unable to load @larksuiteoapi/node-sdk. Run "bun install" before starting the service. Cause: ${cause}`,
  );
}

export async function createFeishuSdkBridge(service: KidsAlfredService): Promise<BotBridge> {
  let sdk: Record<string, any>;
  try {
    sdk = (await import('@larksuiteoapi/node-sdk')) as Record<string, any>;
  } catch (error) {
    throw loadSdkErrorHint(error);
  }

  const baseConfig = {
    appId: service.getConfig().feishu.appId,
    appSecret: service.getConfig().feishu.appSecret,
  };
  const webSocketHealth: BotWebSocketHealth = {
    state: 'disconnected',
    consecutiveReconnectFailures: 0,
    fallbackEventPath: service.getConfig().server.eventPath,
  };
  let wsClient: any;
  let manuallyClosed = false;
  let onlineNotificationSent = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let connectionEventQueue = Promise.resolve();
  const enqueueConnectionEvent = (operation: () => Promise<void>) => {
    connectionEventQueue = connectionEventQueue
      .then(operation)
      .catch((error) => {
        console.error(
          JSON.stringify({
            logType: 'service_event_notification_failed',
            botId: service.getBotId(),
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
  };
  const handleConnectionTransition = (
    previousHealth: BotWebSocketHealth,
    nextHealth: BotWebSocketHealth,
    now: string,
  ) => {
    if (previousHealth.state === nextHealth.state) {
      return;
    }
    enqueueConnectionEvent(async () => {
      onlineNotificationSent = await processServiceConnectionTransition(
        service,
        client,
        previousHealth,
        nextHealth,
        now,
        onlineNotificationSent,
      );
    });
  };
  const runHeartbeatCheck = () => {
    const now = new Date().toISOString();
    enqueueConnectionEvent(async () => {
      await processServiceHeartbeat(service, client, now, { ...webSocketHealth });
    });
  };
  const wsLogger = {
    error: (...messages: unknown[]) => {
      console.error(...messages);
      const now = new Date().toISOString();
      const previousHealth = { ...webSocketHealth };
      const nextHealth = applyWebSocketLogEvent(webSocketHealth, 'error', messages, {
        manuallyClosed,
        now,
      });
      Object.assign(webSocketHealth, nextHealth);
      handleConnectionTransition(previousHealth, nextHealth, now);
    },
    warn: (...messages: unknown[]) => {
      console.warn(...messages);
    },
    info: (...messages: unknown[]) => {
      console.info(...messages);
      const now = new Date().toISOString();
      const previousHealth = { ...webSocketHealth };
      const nextHealth = applyWebSocketLogEvent(webSocketHealth, 'info', messages, {
        manuallyClosed,
        now,
      });
      Object.assign(webSocketHealth, nextHealth);
      handleConnectionTransition(previousHealth, nextHealth, now);
    },
    debug: (...messages: unknown[]) => {
      console.debug(...messages);
      const now = new Date().toISOString();
      const previousHealth = { ...webSocketHealth };
      const nextHealth = applyWebSocketLogEvent(webSocketHealth, 'debug', messages, {
        manuallyClosed,
        now,
      });
      Object.assign(webSocketHealth, nextHealth);
      handleConnectionTransition(previousHealth, nextHealth, now);
    },
    trace: (...messages: unknown[]) => {
      console.debug(...messages);
    },
  };
  const client = new sdk.Client(baseConfig);
  service.attachRunUpdateSink(
    new FeishuRunUpdateSink(
      async (chatId, card) =>
        await sendInteractiveCard(
          client,
          {
            receiveIdType: 'chat_id',
            receiveId: chatId,
          },
          card,
        ),
    ),
  );
  service.attachTaskResultDeliverySink(new FeishuTaskResultSink(client));
  const eventHandlers = createEventDispatcherHandlers(service, client);

  const eventDispatcher = new sdk.EventDispatcher({}).register(eventHandlers);

  const cardHandler = new sdk.CardActionHandler(
    {
      encryptKey: service.getConfig().feishu.encryptKey,
      verificationToken: service.getConfig().feishu.verificationToken,
    },
    async (event: any) => {
      const actorId = extractActorId(event);
      const action = extractCardActionPayload(event);
      const eventKey = buildCardActionIngressKey(service, event, actorId, action);
      if (!(await service.claimIngressEvent(eventKey, 'card.action.trigger'))) {
        await service.logDuplicateIngress({
          actorId,
          eventType: 'card.action.trigger',
          commandType: action.type || 'unknown',
          taskId: action.taskId,
          runId: action.runId,
          confirmationId: action.confirmationId,
        });
        return undefined;
      }
      const response = await service.handleCardAction(actorId, action);
      return response.card;
    },
  );

  const eventHandler = new sdk.EventDispatcher({
    verificationToken: service.getConfig().feishu.verificationToken,
    encryptKey: service.getConfig().feishu.encryptKey,
  }).register(eventHandlers);

  const cardHttpHandler = sdk.adaptDefault(service.getConfig().server.cardPath, cardHandler);
  const eventHttpHandler = sdk.adaptDefault(service.getConfig().server.eventPath, eventHandler, {
    autoChallenge: true,
  });

  return {
    botId: service.getBotId(),
    cardPath: service.getConfig().server.cardPath,
    eventPath: service.getConfig().server.eventPath,
    cardHandler: cardHttpHandler,
    eventHandler: eventHttpHandler,
    startWebSocketClient: async () => {
      if (wsClient) {
        return;
      }
      manuallyClosed = false;
      webSocketHealth.state = 'connecting';
      wsClient = new sdk.WSClient({
        ...baseConfig,
        loggerLevel: sdk.LoggerLevel.info,
        logger: wsLogger,
      });
      await wsClient.start({ eventDispatcher });
      heartbeatTimer = setInterval(runHeartbeatCheck, 60_000);
    },
    close: async () => {
      if (!wsClient) {
        return;
      }
      manuallyClosed = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      webSocketHealth.state = 'disconnected';
      webSocketHealth.nextReconnectAt = undefined;
      if (typeof wsClient.stop === 'function') {
        await wsClient.stop();
      } else if (typeof wsClient.close === 'function') {
        await wsClient.close();
      }
      await connectionEventQueue;
      wsClient = undefined;
    },
    getWebSocketHealth: () =>
      withWarning({
        ...webSocketHealth,
        nextReconnectAt:
          webSocketHealth.state === 'reconnecting' ? nextReconnectAt(wsClient) : undefined,
      }),
  };
}

export function createHealthServer(handler: RequestHandler) {
  return createServer(handler);
}
