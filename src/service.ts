import type {
  AppHealthSnapshot,
  BotConfig,
  CardResponse,
  EventLogEntry,
  EventLogSink,
  PendingConfirmation,
  ReloadResult,
  RunRecord,
  ServiceEventStateRecord,
  ServiceEventType,
  TaskResult,
  TaskResultDeliverySink,
  RunUpdateSink,
  TaskDefinition,
  TaskTool,
} from './domain.ts';
import {
  buildAuthorizationCard,
  buildCancellationCard,
  buildConfirmationCard,
  buildCronStatusCard,
  buildCronTaskListCard,
  buildErrorCard,
  buildHealthCard,
  buildHelpCard,
  buildRunStatusCard,
  buildTaskListCard,
} from './feishu/cards.ts';
import { summarizeParameters, validateParameters } from './config/schema.ts';
import { createConfirmationId, createRunId } from './utils/ids.ts';
import { RunRepository } from './persistence/run-repository.ts';
import { TaskRuntime } from './execution/runtime.ts';
import { createBuiltinToolRegistry } from './tools/index.ts';
import { type CronController, MemoryCronController } from './cron.ts';

export class MemoryRunUpdateSink implements RunUpdateSink {
  readonly updates: RunRecord[] = [];

  async sendRunUpdate(run: RunRecord): Promise<void> {
    this.updates.push(run);
  }
}

export class MemoryTaskResultDeliverySink implements TaskResultDeliverySink {
  readonly deliveries: Array<{
    run: RunRecord;
    task: TaskDefinition;
    result: TaskResult;
  }> = [];

  async sendTaskResult(run: RunRecord, task: TaskDefinition, result: TaskResult): Promise<void> {
    this.deliveries.push({ run, task, result });
  }
}

export class MemoryEventLogSink implements EventLogSink {
  readonly entries: EventLogEntry[] = [];

  async logEvent(entry: EventLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class ConsoleEventLogSink implements EventLogSink {
  async logEvent(entry: EventLogEntry): Promise<void> {
    console.info(
      JSON.stringify({
        logType: 'feishu_inbound_event',
        ...entry,
      }),
    );
  }
}

class MultiRunUpdateSink implements RunUpdateSink {
  private readonly sinks = new Set<RunUpdateSink>();

  constructor(...sinks: RunUpdateSink[]) {
    for (const sink of sinks) {
      this.sinks.add(sink);
    }
  }

  addSink(sink: RunUpdateSink): void {
    this.sinks.add(sink);
  }

  async sendRunUpdate(run: RunRecord): Promise<void> {
    for (const sink of this.sinks) {
      await sink.sendRunUpdate(run);
    }
  }
}

class MultiTaskResultDeliverySink implements TaskResultDeliverySink {
  private readonly sinks = new Set<TaskResultDeliverySink>();

  constructor(...sinks: TaskResultDeliverySink[]) {
    for (const sink of sinks) {
      this.sinks.add(sink);
    }
  }

  addSink(sink: TaskResultDeliverySink): void {
    this.sinks.add(sink);
  }

  async sendTaskResult(run: RunRecord, task: TaskDefinition, result: TaskResult): Promise<void> {
    for (const sink of this.sinks) {
      await sink.sendTaskResult(run, task, result);
    }
  }
}

function normalizeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('Invalid parameter syntax:')) {
    return 'Invalid parameter syntax';
  }
  return message;
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (const character of input.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && inQuotes) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (/\s/u.test(character) && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }

  if (escaped || inQuotes) {
    throw new Error('Unterminated quoted parameter value');
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function parseRunCommand(command: string): { taskId: string; parameters: Record<string, string> } {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    throw new Error('Usage: /run TASK_ID key=value ...');
  }

  const [taskId, ...parameterTokens] = tokens;
  const parameters: Record<string, string> = {};
  for (const token of parameterTokens) {
    const separatorIndex = token.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid parameter syntax: ${token}`);
    }
    const key = token.slice(0, separatorIndex).trim();
    const value = token.slice(separatorIndex + 1);
    if (!key) {
      throw new Error(`Invalid parameter syntax: ${token}`);
    }
    parameters[key] = value;
  }

  return {
    taskId,
    parameters,
  };
}

export class KidsAlfredService {
  private readonly botId: string;
  private readonly updates: MultiRunUpdateSink;
  private readonly resultDeliveries: MultiTaskResultDeliverySink;
  private readonly eventLogs: EventLogSink;
  private readonly reloadHandler?: (botId: string, actorId: string) => Promise<ReloadResult>;
  private config: BotConfig;
  private readonly pendingConfirmations = new Map<string, PendingConfirmation>();
  private repository: RunRepository;
  private runtime: TaskRuntime;
  private readonly cronController: CronController;
  private healthSnapshotProvider?: () => AppHealthSnapshot;
  private readonly serviceReconnectNotificationThresholdMs: number;

  constructor(
    config: BotConfig,
    updates: RunUpdateSink = new MemoryRunUpdateSink(),
    reloadHandler?: (botId: string, actorId: string) => Promise<ReloadResult>,
    eventLogs: EventLogSink = new ConsoleEventLogSink(),
    cronController?: CronController,
    repository?: RunRepository,
    builtinTools?: Map<string, TaskTool>,
    serviceReconnectNotificationThresholdMs = 600000,
  ) {
    this.botId = config.botId;
    this.updates = new MultiRunUpdateSink(updates);
    this.resultDeliveries = new MultiTaskResultDeliverySink();
    this.eventLogs = eventLogs;
    this.reloadHandler = reloadHandler;
    this.config = config;
    this.repository = repository ?? new RunRepository(config.storage.sqlitePath);
    this.runtime = new TaskRuntime(
      this.repository,
      builtinTools ?? createBuiltinToolRegistry(),
      this.updates,
      this.resultDeliveries,
    );
    this.cronController =
      cronController ?? new MemoryCronController(config.botId, config.tasks, this.repository);
    this.serviceReconnectNotificationThresholdMs = serviceReconnectNotificationThresholdMs;
    this.repository.reconcileInterruptedRuns();
  }

  getConfig(): BotConfig {
    return this.config;
  }

  getBotId(): string {
    return this.botId;
  }

  getServiceReconnectNotificationThresholdMs(): number {
    return this.serviceReconnectNotificationThresholdMs;
  }

  setHealthSnapshotProvider(provider: () => AppHealthSnapshot): void {
    this.healthSnapshotProvider = provider;
  }

  claimIngressEvent(eventKey: string, eventType: string): boolean {
    return this.repository.claimIngressEvent(eventKey, eventType);
  }

  async logDuplicateIngress(entry: {
    actorId: string;
    eventType: EventLogEntry['eventType'];
    commandType: string;
    chatId?: string;
    taskId?: string;
    runId?: string;
    confirmationId?: string;
  }): Promise<void> {
    await this.logEvent({
      ...entry,
      decision: 'duplicate_suppressed',
    });
  }

  attachRunUpdateSink(sink: RunUpdateSink): void {
    this.updates.addSink(sink);
  }

  attachTaskResultDeliverySink(sink: TaskResultDeliverySink): void {
    this.resultDeliveries.addSink(sink);
  }

  isAuthorized(actorId: string): boolean {
    return this.config.allowedUsers.includes(actorId);
  }

  async reloadConfig(actorId: string): Promise<CardResponse> {
    this.ensureAuthorized(actorId);
    if (!this.reloadHandler) {
      return buildErrorCard('Reload is not configured for this bot');
    }
    const result = await this.reloadHandler(this.botId, actorId);
    return {
      type: 'card',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: 'Config reloaded',
          },
        },
        elements: [
          {
            tag: 'markdown',
            content: `Reloaded ${result.botCount} bot configuration(s) successfully`,
          },
        ],
      },
    };
  }

  listTasks(actorId: string): CardResponse {
    this.ensureAuthorized(actorId);
    return buildTaskListCard(Object.values(this.config.tasks));
  }

  private hasScreencaptureTask(): boolean {
    return this.config.tasks.sc?.runnerKind === 'builtin-tool'
      && this.config.tasks.sc?.executionMode === 'oneshot'
      && this.config.tasks.sc?.tool === 'screencapture';
  }

  private hasProtectedBuiltinTask(taskId: string, tool: string): boolean {
    return this.config.tasks[taskId]?.runnerKind === 'builtin-tool'
      && this.config.tasks[taskId]?.executionMode === 'oneshot'
      && this.config.tasks[taskId]?.tool === tool;
  }

  private buildUnsupportedCommandMessage(): string {
    const runExample = this.hasScreencaptureTask() ? ' (for example `/run sc`)' : '';
    return `Unsupported command. Use /help, /health, /tasks, /run TASK_ID key=value ...${runExample}, /cron list, /cron start TASK_ID, /cron stop TASK_ID, /cron status, /run-status RUN_ID, /cancel RUN_ID, or /reload.`;
  }

  async listCronTasks(
    actorId: string,
    currentChatId?: string,
    title = 'Cron tasks',
  ): Promise<CardResponse> {
    this.ensureAuthorized(actorId);
    const records = await this.cronController.list();
    const currentChatSubscriptions = currentChatId
      ? Object.fromEntries(
          Object.values(this.config.tasks)
            .filter((task) => task.executionMode === 'cronjob')
            .map((task) => [task.id, this.repository.isCronChatSubscribed(task.id, currentChatId)]),
        )
      : {};
    return buildCronTaskListCard(
      Object.values(this.config.tasks),
      Object.fromEntries(records.map((record) => [record.taskId, record])),
      currentChatSubscriptions,
      title,
    );
  }

  async getCronStatus(actorId: string): Promise<CardResponse> {
    this.ensureAuthorized(actorId);
    const records = await this.cronController.list();
    return buildCronStatusCard(
      Object.values(this.config.tasks),
      Object.fromEntries(records.map((record) => [record.taskId, record])),
    );
  }

  submitTaskRequest(
    actorId: string,
    taskId: string,
    rawParameters: Record<string, unknown>,
    context: { chatId?: string } = {},
  ): CardResponse {
    this.ensureAuthorized(actorId);
    const task = this.getTask(taskId);
    if (task.executionMode !== 'oneshot') {
      throw new Error(`Task mode mismatch: ${taskId} must be managed through /cron`);
    }
    const parameters = validateParameters(task, rawParameters);
    const confirmationId = createConfirmationId();
    this.pendingConfirmations.set(confirmationId, {
      id: confirmationId,
      actorId,
      taskId,
      parameters,
      createdAt: new Date().toISOString(),
      originChatId: context.chatId,
    });
    return buildConfirmationCard(task, parameters, confirmationId);
  }

  cancelPendingConfirmation(actorId: string, confirmationId: string): CardResponse {
    this.ensureAuthorized(actorId);
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) {
      return buildErrorCard(`Unknown confirmation token: ${confirmationId}`);
    }
    if (pending.actorId !== actorId) {
      return buildErrorCard('Confirmation token does not belong to this actor');
    }

    this.pendingConfirmations.delete(confirmationId);
    return buildCancellationCard(`Request cancelled for task **${pending.taskId}**.`);
  }

  async confirmTaskRequest(actorId: string, confirmationId: string): Promise<CardResponse> {
    this.ensureAuthorized(actorId);
    const existingRunId = this.repository.getRunIdForConfirmation(confirmationId);
    if (existingRunId) {
      const existingRun = this.repository.getRun(existingRunId);
      if (!existingRun) {
        throw new Error(`Run not found for confirmation ${confirmationId}`);
      }
      return buildRunStatusCard(existingRun);
    }

    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) {
      return buildErrorCard(`Unknown confirmation token: ${confirmationId}`);
    }
    if (pending.actorId !== actorId) {
      return buildErrorCard('Confirmation token does not belong to this actor');
    }

    const task = this.getTask(pending.taskId);
    const now = new Date().toISOString();
    const run: RunRecord = {
      runId: createRunId(),
      taskId: task.id,
      taskType: task.runnerKind,
      actorId,
      confirmationId,
      state: 'queued',
      parameters: pending.parameters,
      parameterSummary: summarizeParameters(pending.parameters),
      createdAt: now,
      updatedAt: now,
      statusSummary: 'Run queued',
      originChatId: pending.originChatId,
      cancellable: task.cancellable,
    };

    const result = this.repository.createRunWithConfirmation(run);
    const persisted = this.repository.getRun(result.runId);
    if (!persisted) {
      throw new Error(`Failed to load persisted run ${result.runId}`);
    }

    if (result.created) {
      this.pendingConfirmations.delete(confirmationId);
      void this.runtime.start(persisted, task);
    }
    return buildRunStatusCard(persisted);
  }

  getRunStatus(actorId: string, runId: string): CardResponse {
    this.ensureAuthorized(actorId);
    const run = this.repository.getRun(runId);
    if (!run) {
      return buildErrorCard(`Run not found: ${runId}`);
    }
    return buildRunStatusCard(run);
  }

  listRecentRuns(actorId: string): RunRecord[] {
    this.ensureAuthorized(actorId);
    return this.repository.listRecentRuns(actorId);
  }

  cancelRun(actorId: string, runId: string): CardResponse {
    this.ensureAuthorized(actorId);
    const run = this.repository.getRun(runId);
    if (!run) {
      return buildErrorCard(`Run not found: ${runId}`);
    }
    if (!run.cancellable) {
      return buildErrorCard(`Run ${runId} is not cancellable`);
    }
    const cancelled = this.runtime.cancel(runId);
    if (!cancelled) {
      return buildErrorCard(`Run ${runId} is not currently cancellable`);
    }
    return buildRunStatusCard(this.repository.getRun(runId)!);
  }

  async handleMessage(
    actorId: string,
    text: string,
    context: { chatId?: string } = {},
  ): Promise<CardResponse> {
    const trimmed = text.trim();
    const commandType = this.detectMessageCommandType(trimmed);
    try {
      if (!this.isAuthorized(actorId)) {
        const response = this.buildPairingCard(actorId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType,
          decision: 'authorization_required',
        });
        return response;
      }
      if (trimmed === '/tasks') {
        const response = this.listTasks(actorId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'tasks',
          decision: 'tasks_listed',
        });
        return response;
      }
      if (trimmed === '/health') {
        const response = this.getHealth(actorId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'health',
          decision: 'status_returned',
        });
        return response;
      }
      if (trimmed === '/cron list' || trimmed === '/cron status') {
        const response =
          trimmed === '/cron list'
            ? await this.listCronTasks(actorId, context.chatId)
            : await this.getCronStatus(actorId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: trimmed === '/cron list' ? 'cron_list' : 'cron_status',
          decision: 'status_returned',
        });
        return response;
      }
      if (trimmed === '/help') {
        const response = buildHelpCard({
          hasScreencaptureTask: this.hasScreencaptureTask(),
          hasUpdateTask: this.hasProtectedBuiltinTask('update', 'self-update'),
          hasRollbackTask: this.hasProtectedBuiltinTask('rollback', 'self-rollback'),
        });
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'help',
          decision: 'help_returned',
        });
        return response;
      }
      if (trimmed.startsWith('/run ')) {
        const { taskId, parameters } = parseRunCommand(trimmed.replace('/run ', '').trim());
        const response = this.submitTaskRequest(actorId, taskId, parameters, context);
        const confirmationId = this.findPendingConfirmationId(actorId, taskId, context.chatId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'run',
          decision: 'confirmation_created',
          taskId,
          confirmationId,
        });
        return response;
      }
      if (trimmed.startsWith('/cron start ')) {
        const taskId = trimmed.replace('/cron start ', '').trim();
        const response = await this.startCronTask(actorId, taskId, context.chatId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'cron_start',
          decision: 'cron_started',
          taskId,
        });
        return response;
      }
      if (trimmed.startsWith('/cron stop ')) {
        const taskId = trimmed.replace('/cron stop ', '').trim();
        const response = await this.stopCronTask(actorId, taskId, context.chatId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'cron_stop',
          decision: 'cron_stopped',
          taskId,
        });
        return response;
      }
      if (trimmed.startsWith('/run-status ')) {
        const runId = trimmed.replace('/run-status ', '').trim();
        const response = this.getRunStatus(actorId, runId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'run_status',
          decision: 'status_returned',
          runId,
        });
        return response;
      }
      if (trimmed.startsWith('/cancel ')) {
        const runId = trimmed.replace('/cancel ', '').trim();
        const response = this.cancelRun(actorId, runId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'cancel_run',
          decision: 'run_cancel_requested',
          runId,
        });
        return response;
      }
      if (trimmed === '/reload') {
        const response = await this.reloadConfig(actorId);
        await this.logEvent({
          actorId,
          chatId: context.chatId,
          eventType: 'im.message.receive_v1',
          commandType: 'reload',
          decision: 'reload_requested',
        });
        return response;
      }
      const response = buildErrorCard(this.buildUnsupportedCommandMessage());
      await this.logEvent({
        actorId,
        chatId: context.chatId,
        eventType: 'im.message.receive_v1',
        commandType,
        decision: 'invalid_command',
        errorSummary: 'Unsupported command',
      });
      return response;
    } catch (error) {
      await this.logEvent({
        actorId,
        chatId: context.chatId,
        eventType: 'im.message.receive_v1',
        commandType,
        decision: 'validation_failed',
        errorSummary: normalizeErrorSummary(error),
      });
      return this.toErrorCard(error);
    }
  }

  async handleCardAction(
    actorId: string,
    action: { type: string; taskId?: string; parameters?: Record<string, unknown>; confirmationId?: string; runId?: string },
  ): Promise<CardResponse> {
    const commandType = action.type || 'unknown';
    const resolvedActorId = this.resolveCardActionActorId(actorId, action);
    try {
      if (!this.isAuthorized(resolvedActorId)) {
        const response = this.buildPairingCard(resolvedActorId);
        await this.logEvent({
          actorId: resolvedActorId,
          eventType: 'card.action.trigger',
          commandType,
          decision: 'authorization_required',
          confirmationId: action.confirmationId,
          runId: action.runId,
        });
        return response;
      }
      switch (action.type) {
        case 'confirm_task': {
          if (!action.confirmationId) {
            const response = buildErrorCard('confirmationId is required');
            await this.logEvent({
              actorId: resolvedActorId,
              eventType: 'card.action.trigger',
              commandType,
              decision: 'validation_failed',
              errorSummary: 'confirmationId is required',
            });
            return response;
          }
          const confirmResponse = await this.confirmTaskRequest(resolvedActorId, action.confirmationId);
          const runId = this.repository.getRunIdForConfirmation(action.confirmationId);
          const run = runId ? this.repository.getRun(runId) : undefined;
          await this.logEvent({
            actorId: resolvedActorId,
            eventType: 'card.action.trigger',
            commandType,
            decision: runId ? 'run_started' : 'validation_failed',
            confirmationId: action.confirmationId,
            runId,
            taskId: run?.taskId,
            errorSummary: runId ? undefined : 'Unknown confirmation token',
          });
          return confirmResponse;
        }
        case 'cancel_confirmation': {
          if (!action.confirmationId) {
            const response = buildErrorCard('confirmationId is required');
            await this.logEvent({
              actorId: resolvedActorId,
              eventType: 'card.action.trigger',
              commandType,
              decision: 'validation_failed',
              errorSummary: 'confirmationId is required',
            });
            return response;
          }
          const response = this.cancelPendingConfirmation(resolvedActorId, action.confirmationId);
          await this.logEvent({
            actorId: resolvedActorId,
            eventType: 'card.action.trigger',
            commandType,
            decision: 'confirmation_cancelled',
            confirmationId: action.confirmationId,
          });
          return response;
        }
        default: {
          const response = buildErrorCard(`Unsupported action: ${action.type}`);
          await this.logEvent({
            actorId: resolvedActorId,
            eventType: 'card.action.trigger',
            commandType,
            decision: 'invalid_command',
            errorSummary: `Unsupported action: ${action.type}`,
          });
          return response;
        }
      }
    } catch (error) {
      await this.logEvent({
        actorId: resolvedActorId,
        eventType: 'card.action.trigger',
        commandType,
        decision: 'validation_failed',
        confirmationId: action.confirmationId,
        runId: action.runId,
        errorSummary: normalizeErrorSummary(error),
      });
      return this.toErrorCard(error);
    }
  }

  async close(): Promise<void> {
    await this.runtime.waitForIdle();
    this.repository.close();
  }

  async reconcileCronJobs(): Promise<void> {
    await this.cronController.reconcile();
  }

  reconcileServiceEventSubscriptions(): void {
    const allowed = new Set(this.config.allowedUsers);
    const current = this.repository.listServiceEventSubscriptions();
    const currentActors = new Set(current.map((record) => record.actorId));
    for (const actorId of currentActors) {
      if (!allowed.has(actorId)) {
        this.repository.deleteServiceEventSubscriptionsForActor(actorId);
      }
    }
    for (const actorId of allowed) {
      this.repository.upsertServiceEventSubscription(actorId, 'service_online', true);
      this.repository.upsertServiceEventSubscription(actorId, 'service_reconnected', true);
    }
  }

  listServiceEventSubscriberActorIds(eventType: ServiceEventType): string[] {
    return this.repository
      .listServiceEventSubscriptions(eventType, { enabledOnly: true })
      .map((record) => record.actorId);
  }

  getServiceEventState(): ServiceEventStateRecord | undefined {
    return this.repository.getServiceEventState();
  }

  saveServiceEventState(
    state: Partial<{
      lastConnectedAt: string | null;
      lastDisconnectedAt: string | null;
      lastReconnectedNotifiedAt: string | null;
    }>,
    updatedAt?: string,
  ): ServiceEventStateRecord {
    return this.repository.saveServiceEventState(state, updatedAt);
  }

  private toErrorCard(error: unknown): CardResponse {
    if (error instanceof Error) {
      return buildErrorCard(error.message);
    }
    return buildErrorCard(String(error));
  }

  private buildPairingCard(actorId: string): CardResponse {
    if (!actorId.trim()) {
      return buildErrorCard('Unable to determine actor identity for authorization');
    }
    const pairing = this.repository.issuePairing(this.botId, actorId);
    return buildAuthorizationCard(this.botId, pairing.pairCode);
  }

  private ensureAuthorized(actorId: string): void {
    if (!this.config.allowedUsers.includes(actorId)) {
      throw new Error(`Actor ${actorId} is not authorized`);
    }
  }

  private getHealth(actorId: string): CardResponse {
    this.ensureAuthorized(actorId);
    if (!this.healthSnapshotProvider) {
      throw new Error('Health snapshot is not configured for this bot');
    }
    return buildHealthCard(this.healthSnapshotProvider());
  }

  private getTask(taskId: string) {
    const task = this.config.tasks[taskId];
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    return task;
  }

  private async startCronTask(
    actorId: string,
    taskId: string,
    chatId?: string,
  ): Promise<CardResponse> {
    this.ensureAuthorized(actorId);
    const task = this.getTask(taskId);
    if (task.executionMode !== 'cronjob') {
      throw new Error(`Task mode mismatch: ${taskId} is not a cronjob task`);
    }
    if (!chatId?.trim()) {
      throw new Error('Chat context is required for /cron start');
    }
    this.repository.upsertCronSubscription(taskId, chatId, actorId);
    await this.cronController.start(taskId);
    return await this.listCronTasks(actorId, chatId, 'Cron task started');
  }

  private async stopCronTask(
    actorId: string,
    taskId: string,
    chatId?: string,
  ): Promise<CardResponse> {
    this.ensureAuthorized(actorId);
    const task = this.getTask(taskId);
    if (task.executionMode !== 'cronjob') {
      throw new Error(`Task mode mismatch: ${taskId} is not a cronjob task`);
    }
    await this.cronController.stop(taskId);
    this.repository.clearCronSubscriptions(taskId);
    return await this.listCronTasks(actorId, chatId, 'Cron task stopped');
  }

  private detectMessageCommandType(text: string): string {
    if (text === '/help') {
      return 'help';
    }
    if (text === '/health') {
      return 'health';
    }
    if (text === '/tasks') {
      return 'tasks';
    }
    if (text.startsWith('/run ')) {
      return 'run';
    }
    if (text === '/cron list') {
      return 'cron_list';
    }
    if (text === '/cron status') {
      return 'cron_status';
    }
    if (text.startsWith('/cron start ')) {
      return 'cron_start';
    }
    if (text.startsWith('/cron stop ')) {
      return 'cron_stop';
    }
    if (text.startsWith('/run-status ')) {
      return 'run_status';
    }
    if (text.startsWith('/cancel ')) {
      return 'cancel_run';
    }
    if (text === '/reload') {
      return 'reload';
    }
    return 'unknown';
  }

  private findPendingConfirmationId(
    actorId: string,
    taskId: string,
    chatId?: string,
  ): string | undefined {
    const pendingEntries = [...this.pendingConfirmations.values()].reverse();
    return pendingEntries.find(
      (entry) =>
        entry.actorId === actorId && entry.taskId === taskId && entry.originChatId === chatId,
    )?.id;
  }

  private resolveCardActionActorId(
    actorId: string,
    action: { confirmationId?: string },
  ): string {
    if (actorId.trim()) {
      return actorId;
    }
    if (!action.confirmationId) {
      return actorId;
    }

    const pendingActorId = this.pendingConfirmations.get(action.confirmationId)?.actorId;
    if (pendingActorId?.trim()) {
      return pendingActorId;
    }

    const runId = this.repository.getRunIdForConfirmation(action.confirmationId);
    const persistedActorId = runId ? this.repository.getRun(runId)?.actorId : undefined;
    if (persistedActorId?.trim()) {
      return persistedActorId;
    }

    return actorId;
  }

  private async logEvent(
    entry: Omit<EventLogEntry, 'timestamp' | 'botId' | 'channel'>,
  ): Promise<void> {
    try {
      await this.eventLogs.logEvent({
        timestamp: new Date().toISOString(),
        botId: this.botId,
        channel: 'feishu',
        ...entry,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          logType: 'feishu_event_log_failure',
          botId: this.botId,
          eventType: entry.eventType,
          actorId: entry.actorId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
