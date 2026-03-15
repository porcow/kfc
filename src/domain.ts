export type RunnerKind = 'builtin-tool' | 'external-command';
export type ExecutionMode = 'oneshot' | 'cronjob';
export type ParameterType = 'string' | 'number' | 'boolean';
export type ToolConfigValue = string | number | boolean;
export type RouteKind = 'card' | 'event';
export type WebSocketState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type RunState =
  | 'pending_confirmation'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'rejected';

export interface ParameterDefinition {
  type: ParameterType;
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
}

interface TaskDefinitionBase {
  id: string;
  description: string;
  runnerKind: RunnerKind;
  executionMode: ExecutionMode;
  timeoutMs: number;
  cancellable: boolean;
  parameters: Record<string, ParameterDefinition>;
  cron?: CronTaskConfig;
}

export interface BuiltinToolTaskDefinition extends TaskDefinitionBase {
  runnerKind: 'builtin-tool';
  tool: string;
  config?: Record<string, ToolConfigValue>;
}

export interface ExternalCommandTaskDefinition extends TaskDefinitionBase {
  runnerKind: 'external-command';
  command: string;
  args: string[];
}

export type TaskDefinition = BuiltinToolTaskDefinition | ExternalCommandTaskDefinition;

export interface CronTaskConfig {
  schedule: string;
  autoStart: boolean;
}

export interface GlobalServerConfig {
  port: number;
  healthPath: string;
  serviceReconnectNotificationThresholdMs: number;
}

export interface BotConfig {
  botId: string;
  sourcePath?: string;
  workingDirectory: string;
  allowedUsers: string[];
  server: {
    cardPath: string;
    eventPath: string;
  };
  storage: {
    sqlitePath: string;
  };
  feishu: {
    appId: string;
    appSecret: string;
    verificationToken?: string;
    encryptKey?: string;
  };
  tasks: Record<string, TaskDefinition>;
  loadedAt: string;
}

export interface AppConfig {
  sourcePath: string;
  server: GlobalServerConfig;
  bots: Record<string, BotConfig>;
  loadedAt: string;
}

export interface PendingConfirmation {
  id: string;
  actorId: string;
  taskId: string;
  parameters: Record<string, string | number | boolean>;
  createdAt: string;
  originChatId?: string;
}

export interface PairingRecord {
  botId?: string;
  actorId: string;
  pairCode: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface RunRecord {
  runId: string;
  taskId: string;
  taskType: RunnerKind;
  actorId: string;
  confirmationId: string;
  state: RunState;
  parameters: Record<string, string | number | boolean>;
  parameterSummary: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  statusSummary?: string;
  resultJson?: string;
  originChatId?: string;
  cancellable: boolean;
}

export interface TaskResult {
  summary: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  data?: Record<string, unknown>;
  notifications?: TaskNotificationIntent[];
  artifacts?: TaskResultArtifact[];
}

export interface TaskNotificationIntent {
  channel: 'feishu';
  chatId?: string;
  actorId?: string;
  title?: string;
  body: string;
}

export interface TaskResultArtifact {
  channel: 'feishu';
  kind: 'origin-chat-image';
  path: string;
  deleteAfterDelivery?: boolean;
}

export interface PDWin11MonitorState {
  state: 'off' | 'on';
  detectedStartAt?: string;
  lastTransitionAt: string;
  lastNotificationAt?: string;
  lastRuntimeReminderAt?: string;
}

export interface PDWin11MonitorStateStore {
  getPDWin11State(taskId: string): PDWin11MonitorState | undefined;
  savePDWin11State(taskId: string, state: PDWin11MonitorState): PDWin11MonitorState;
}

export interface TaskRunContext {
  runId: string;
  signal: AbortSignal;
  task: TaskDefinition;
  actorId: string;
  botId?: string;
  parameters: Record<string, string | number | boolean>;
  pdWin11StateStore?: PDWin11MonitorStateStore;
}

export interface TaskTool {
  id: string;
  execute(context: TaskRunContext): Promise<TaskResult>;
}

export interface TaskResultDeliverySink {
  sendTaskResult(run: RunRecord, task: TaskDefinition, result: TaskResult): Promise<void>;
}

export interface CardResponse {
  type: 'card' | 'error';
  card: Record<string, unknown>;
}

export interface RunUpdateSink {
  sendRunUpdate(run: RunRecord): Promise<void>;
}

export interface ReloadResult {
  botCount: number;
}

export type CronDesiredState = 'started' | 'stopped';
export type CronObservedState = 'running' | 'stopped' | 'unknown';

export interface CronJobRecord {
  taskId: string;
  launchdLabel: string;
  schedule: string;
  autoStart: boolean;
  desiredState: CronDesiredState;
  observedState: CronObservedState;
  createdAt: string;
  updatedAt: string;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastError?: string;
}

export interface CronChatSubscriptionRecord {
  taskId: string;
  chatId: string;
  actorId: string;
  createdAt: string;
  updatedAt: string;
}

export type ServiceEventType = 'service_online' | 'service_reconnected';

export interface ServiceEventSubscriptionRecord {
  actorId: string;
  eventType: ServiceEventType;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceEventStateRecord {
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  lastReconnectedNotifiedAt?: string;
  updatedAt: string;
}

export interface EventLogEntry {
  timestamp: string;
  botId: string;
  channel: 'feishu';
  eventType: 'im.message.receive_v1' | 'card.action.trigger';
  actorId: string;
  chatId?: string;
  commandType: string;
  decision: string;
  taskId?: string;
  runId?: string;
  confirmationId?: string;
  errorSummary?: string;
}

export interface EventLogSink {
  logEvent(entry: EventLogEntry): Promise<void>;
}

export interface BotWebSocketHealth {
  state: WebSocketState;
  lastConnectedAt?: string;
  nextReconnectAt?: string;
  lastError?: string;
  consecutiveReconnectFailures: number;
  fallbackEventPath?: string;
  warning?: string;
}

export interface AppHealthSnapshot {
  ok: true;
  loadedAt: string;
  bots: string[];
  websocket: Record<string, BotWebSocketHealth>;
  ready: boolean;
}
