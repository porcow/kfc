import { readFile } from 'node:fs/promises';

import type {
  AppConfig,
  BotConfig,
  BuiltinToolTaskDefinition,
  CronTaskConfig,
  ExecutionMode,
  ExternalCommandTaskDefinition,
  GlobalServerConfig,
  ParameterDefinition,
  RunnerKind,
  TaskDefinition,
} from '../domain.ts';
import { parseToml } from './toml.ts';

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object at ${path}`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Expected non-empty string at ${path}`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}`);
  }
  return value;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Expected number at ${path}`);
  }
  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Expected string array at ${path}`);
  }
  return value as string[];
}

function parseParameterDefinitions(input: unknown, path: string): Record<string, ParameterDefinition> {
  const object = expectObject(input ?? {}, path);
  const definitions: Record<string, ParameterDefinition> = {};

  for (const [parameterName, parameterValue] of Object.entries(object)) {
    const parameter = expectObject(parameterValue, `${path}.${parameterName}`);
    const type = expectString(parameter.type, `${path}.${parameterName}.type`);
    if (!['string', 'number', 'boolean'].includes(type)) {
      throw new Error(`Unsupported parameter type at ${path}.${parameterName}.type`);
    }
    definitions[parameterName] = {
      type: type as ParameterDefinition['type'],
      required: expectBoolean(parameter.required ?? false, `${path}.${parameterName}.required`),
      description:
        parameter.description === undefined
          ? undefined
          : expectString(parameter.description, `${path}.${parameterName}.description`),
      defaultValue: parameter.default,
    };
  }

  return definitions;
}

function parseCronConfig(input: unknown, path: string): CronTaskConfig {
  const cron = expectObject(input, path);
  return {
    schedule: expectString(cron.schedule, `${path}.schedule`),
    autoStart: expectBoolean(cron.auto_start, `${path}.auto_start`),
  };
}

function parseTask(taskId: string, input: unknown, pathPrefix: string): TaskDefinition {
  const task = expectObject(input, `${pathPrefix}.${taskId}`);
  const runnerKind = expectString(
    task.runner_kind,
    `${pathPrefix}.${taskId}.runner_kind`,
  ) as RunnerKind;
  const executionMode = expectString(
    task.execution_mode,
    `${pathPrefix}.${taskId}.execution_mode`,
  ) as ExecutionMode;
  const base = {
    id: taskId,
    description: expectString(task.description, `${pathPrefix}.${taskId}.description`),
    timeoutMs: expectNumber(task.timeout_ms ?? 30000, `${pathPrefix}.${taskId}.timeout_ms`),
    cancellable: expectBoolean(task.cancellable ?? false, `${pathPrefix}.${taskId}.cancellable`),
    parameters: parseParameterDefinitions(task.parameters, `${pathPrefix}.${taskId}.parameters`),
    runnerKind,
    executionMode,
    cron:
      executionMode === 'cronjob'
        ? parseCronConfig(task.cron, `${pathPrefix}.${taskId}.cron`)
        : undefined,
  };

  if (!['builtin-tool', 'external-command'].includes(runnerKind)) {
    throw new Error(`Unsupported runner kind for ${taskId}: ${runnerKind}`);
  }
  if (!['oneshot', 'cronjob'].includes(executionMode)) {
    throw new Error(`Unsupported execution mode for ${taskId}: ${executionMode}`);
  }

  if (runnerKind === 'builtin-tool') {
    return {
      ...base,
      tool: expectString(task.tool, `${pathPrefix}.${taskId}.tool`),
    } satisfies BuiltinToolTaskDefinition;
  }

  if (runnerKind === 'external-command') {
    return {
      ...base,
      command: expectString(task.command, `${pathPrefix}.${taskId}.command`),
      args: expectStringArray(task.args ?? [], `${pathPrefix}.${taskId}.args`),
    } satisfies ExternalCommandTaskDefinition;
  }

  throw new Error(`Unsupported runner kind for ${taskId}: ${runnerKind}`);
}

function validateUniquePaths(
  bots: Record<string, BotConfig>,
  selector: (bot: BotConfig) => string,
  label: string,
): void {
  const seen = new Map<string, string>();
  for (const [botId, botConfig] of Object.entries(bots)) {
    const value = selector(botConfig);
    const existing = seen.get(value);
    if (existing) {
      throw new Error(`Duplicate ${label}: ${value} used by ${existing} and ${botId}`);
    }
    seen.set(value, botId);
  }
}

function parseGlobalServer(input: unknown): GlobalServerConfig {
  const server = expectObject(input ?? {}, 'server');
  return {
    port: expectNumber(server.port ?? 3000, 'server.port'),
    healthPath: expectString(server.health_path ?? '/health', 'server.health_path'),
  };
}

function parseBotConfig(botId: string, input: unknown, loadedAt: string): BotConfig {
  const bot = expectObject(input, `bots.${botId}`);
  const server = expectObject(bot.server ?? {}, `bots.${botId}.server`);
  const storage = expectObject(bot.storage ?? {}, `bots.${botId}.storage`);
  const feishu = expectObject(bot.feishu ?? {}, `bots.${botId}.feishu`);
  const rawTasks = expectObject(bot.tasks ?? {}, `bots.${botId}.tasks`);
  const tasks: Record<string, TaskDefinition> = {};
  for (const [taskId, taskValue] of Object.entries(rawTasks)) {
    tasks[taskId] = parseTask(taskId, taskValue, `bots.${botId}.tasks`);
  }

  return {
    botId,
    allowedUsers: expectStringArray(bot.allowed_users ?? [], `bots.${botId}.allowed_users`),
    server: {
      cardPath: expectString(
        server.card_path ?? `/bots/${botId}/webhook/card`,
        `bots.${botId}.server.card_path`,
      ),
      eventPath: expectString(
        server.event_path ?? `/bots/${botId}/webhook/event`,
        `bots.${botId}.server.event_path`,
      ),
    },
    storage: {
      sqlitePath: expectString(
        storage.sqlite_path ?? `./data/${botId}.sqlite`,
        `bots.${botId}.storage.sqlite_path`,
      ),
    },
    feishu: {
      appId: expectString(feishu.app_id ?? '', `bots.${botId}.feishu.app_id`),
      appSecret: expectString(feishu.app_secret ?? '', `bots.${botId}.feishu.app_secret`),
      verificationToken:
        feishu.verification_token === undefined
          ? undefined
          : expectString(feishu.verification_token, `bots.${botId}.feishu.verification_token`),
      encryptKey:
        feishu.encrypt_key === undefined
          ? undefined
          : expectString(feishu.encrypt_key, `bots.${botId}.feishu.encrypt_key`),
    },
    tasks,
    loadedAt,
  };
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const source = await readFile(configPath, 'utf8');
  const raw = parseToml(source);
  const loadedAt = new Date().toISOString();
  const botsObject = expectObject(raw.bots ?? {}, 'bots');
  const botIds = Object.keys(botsObject);
  if (botIds.length === 0) {
    throw new Error('Expected at least one bot under [bots.<id>]');
  }

  const bots: Record<string, BotConfig> = {};
  for (const [botId, botValue] of Object.entries(botsObject)) {
    bots[botId] = parseBotConfig(botId, botValue, loadedAt);
  }

  validateUniquePaths(bots, (bot) => bot.server.cardPath, 'card_path');
  validateUniquePaths(bots, (bot) => bot.server.eventPath, 'event_path');
  validateUniquePaths(bots, (bot) => bot.storage.sqlitePath, 'sqlite_path');

  return {
    sourcePath: configPath,
    server: parseGlobalServer(raw.server),
    bots,
    loadedAt,
  };
}

export function summarizeParameters(
  parameters: Record<string, string | number | boolean>,
): string {
  return JSON.stringify(parameters);
}

export function validateParameters(
  task: TaskDefinition,
  candidate: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const normalized: Record<string, string | number | boolean> = {};

  for (const parameterName of Object.keys(candidate)) {
    if (!(parameterName in task.parameters)) {
      throw new Error(`Unknown parameter: ${parameterName}`);
    }
  }

  for (const [parameterName, definition] of Object.entries(task.parameters)) {
    const value = candidate[parameterName];
    if (value === undefined || value === null || value === '') {
      if (definition.defaultValue !== undefined) {
        normalized[parameterName] = definition.defaultValue;
        continue;
      }
      if (definition.required) {
        throw new Error(`Missing required parameter: ${parameterName}`);
      }
      continue;
    }

    switch (definition.type) {
      case 'string':
        normalized[parameterName] = String(value);
        break;
      case 'number': {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(parsed)) {
          throw new Error(`Invalid number parameter: ${parameterName}`);
        }
        normalized[parameterName] = parsed;
        break;
      }
      case 'boolean':
        if (typeof value === 'boolean') {
          normalized[parameterName] = value;
        } else if (value === 'true' || value === 'false') {
          normalized[parameterName] = value === 'true';
        } else {
          throw new Error(`Invalid boolean parameter: ${parameterName}`);
        }
        break;
      default:
        throw new Error(`Unsupported parameter definition for ${parameterName}`);
    }
  }

  return normalized;
}
