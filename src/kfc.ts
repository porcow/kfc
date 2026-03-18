import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import readline from 'node:readline/promises';
import * as sdk from '@larksuiteoapi/node-sdk';

import { defaultBotWorkingDirectory, defaultConfigPath, resolveAppEntrypoint } from './config/paths.ts';
import { loadConfig, validateParameters } from './config/schema.ts';
import type { KfcServiceManager } from './service-manager.ts';
import {
  cleanupCronLaunchdJobs,
  LaunchdServiceManager,
  listCronCleanupTargets,
  readInstalledServiceConfigPath,
  servicePlistPath,
  isServiceInstalled,
  SERVICE_LABEL,
} from './service-manager.ts';
import { inspectRollbackState, inspectUpdateState } from './update.ts';
import {
  cliRollbackViaPreparedHandoff,
  cliUpdateViaPreparedHandoff,
  runDetachedServiceRefreshOperation,
} from './service-refresh.ts';
import type {
  AppHealthSnapshot,
  BotConfig,
  TaskDefinition,
  TaskNotificationIntent,
  TaskResult,
  TaskTool,
} from './domain.ts';
import { authorizePairing, invokeLocalReload } from './pairing.ts';
import { createBuiltinToolRegistry } from './tools/index.ts';
import { RunRepository } from './persistence/run-repository.ts';
import { readCurrentVersionLabel } from './version.ts';

export { LaunchdServiceManager } from './service-manager.ts';

const execFileAsync = promisify(execFile);

export interface KfcCliDeps {
  serviceManager: KfcServiceManager;
  pairAuthorizer: (pairCode: string) => Promise<{ actorId: string; changed: boolean }>;
  taskExecutor: (botId: string, taskId: string) => Promise<TaskResult>;
  healthReader: () => Promise<AppHealthSnapshot>;
  versionReader?: () => Promise<string>;
  updateInspector?: () => Promise<import('./update.ts').UpdateInspection>;
  updatePerformer?: (
    inspection: Extract<import('./update.ts').UpdateInspection, { status: 'update_available' }>,
  ) => Promise<import('./update.ts').UpdateExecutionResult>;
  confirmUpdate?: (prompt: string) => Promise<boolean>;
  rollbackInspector?: () => Promise<import('./update.ts').RollbackInspection>;
  rollbackPerformer?: (
    inspection: Extract<import('./update.ts').RollbackInspection, { status: 'rollback_available' }>,
  ) => Promise<import('./update.ts').RollbackExecutionResult>;
  confirmRollback?: (prompt: string) => Promise<boolean>;
  confirmFullUninstall: (prompt: string) => Promise<boolean>;
  fullUninstaller: (deleteConfig: boolean) => Promise<void>;
  stdout: { write(value: string): void };
  stderr: { write(value: string): void };
}

interface ExecuteConfiguredTaskOptions {
  builtinTools?: Map<string, TaskTool>;
  sendFeishuNotification?: (
    bot: BotConfig,
    notification: TaskNotificationIntent,
  ) => Promise<void>;
}

async function confirmInteractive(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function installedAppRoot(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, '.local', 'share', 'kfc');
}

function installedLauncherPath(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, '.local', 'bin', 'kfc');
}

function installedConfigPath(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, '.config', 'kfc', 'config.toml');
}

function mainLaunchdLabel(): string {
  return SERVICE_LABEL;
}

async function bootoutLaunchdPlist(
  plistPath: string,
  label: string,
  execImpl: typeof execFileAsync = execFileAsync,
): Promise<void> {
  await execImpl('launchctl', ['bootout', `gui/${process.getuid()}/${label}`]).catch(() => undefined);
  await execImpl('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]).catch(() => undefined);
}

async function removeIfExists(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true }).catch((error) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  });
}

async function listFallbackCronPlists(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (entry.isFile() && path.includes('/launchd/') && path.endsWith('.plist')) {
        results.push(path);
      }
    }
  }
  await walk(root);
  return results;
}

async function performFullUninstall(serviceManager: KfcServiceManager, deleteConfig: boolean): Promise<void> {
  await serviceManager.uninstall().catch(() => undefined);

  const plistPath = servicePlistPath();
  await bootoutLaunchdPlist(plistPath, mainLaunchdLabel()).catch(() => undefined);
  await unlink(plistPath).catch(() => undefined);

  const workDir = defaultBotWorkingDirectory();
  const fallbackCronPlists = await listFallbackCronPlists(workDir);
  for (const cronPlist of fallbackCronPlists) {
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}`, cronPlist]).catch(() => undefined);
    await unlink(cronPlist).catch(() => undefined);
  }

  await removeIfExists(installedAppRoot());
  await removeIfExists(workDir);
  await removeIfExists(installedLauncherPath());
  if (deleteConfig) {
    await removeIfExists(installedConfigPath());
  }
}

function parseFlags(tokens: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const value = tokens[index + 1];
    if (value && !value.startsWith('--')) {
      flags[token] = value;
      index += 1;
    } else {
      flags[token] = 'true';
    }
  }
  return flags;
}

async function runExternalCommand(
  task: Extract<TaskDefinition, { runnerKind: 'external-command' }>,
  parameters: Record<string, string | number | boolean>,
): Promise<TaskResult> {
  return await new Promise<TaskResult>((resolvePromise, rejectPromise) => {
    const args = task.args.map((arg) =>
      arg.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(parameters[name] ?? '')),
    );
    const command = task.command.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) =>
      String(parameters[name] ?? ''),
    );
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({
          summary: stdout.trim() || `Command ${task.command} completed successfully`,
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          exitCode: 0,
        });
        return;
      }
      rejectPromise(new Error(stderr.trim() || `Command exited with code ${code}`));
    });
  });
}

function resolveDefaultParameters(task: TaskDefinition): Record<string, string | number | boolean> {
  const defaults = Object.fromEntries(
    Object.entries(task.parameters)
      .filter(([_name, definition]) => definition.defaultValue !== undefined)
      .map(([name, definition]) => [name, definition.defaultValue!]),
  );
  return validateParameters(task, defaults);
}

export async function executeTaskDefinition(
  task: TaskDefinition,
  parameters: Record<string, string | number | boolean>,
  actorId = 'local-admin',
  runId = `kfc_${task.id}`,
  options: {
    botId?: string;
    pdWin11StateStore?: {
      getPDWin11State(taskId: string): unknown;
      savePDWin11State(taskId: string, state: unknown): unknown;
    };
    builtinTools?: Map<string, TaskTool>;
  } = {},
): Promise<TaskResult> {
  if (task.runnerKind === 'builtin-tool') {
    const tool = (options.builtinTools ?? createBuiltinToolRegistry()).get(task.tool);
    if (!tool) {
      throw new Error(`Builtin tool not found: ${task.tool}`);
    }
    return await tool.execute({
      runId,
      signal: new AbortController().signal,
      task,
      actorId,
      botId: options.botId,
      parameters,
      pdWin11StateStore: options.pdWin11StateStore,
    });
  }

  return await runExternalCommand(task, parameters);
}

export async function executeConfiguredTask(
  configPath: string,
  botId: string,
  taskId: string,
  options: ExecuteConfiguredTaskOptions = {},
): Promise<TaskResult> {
  const config = await loadConfig(configPath);
  const bot = config.bots[botId];
  if (!bot) {
    throw new Error(`Unknown bot: ${botId}`);
  }
  const task = bot.tasks[taskId];
  if (!task) {
    throw new Error(`Unknown task: ${taskId}`);
  }

  const parameters = resolveDefaultParameters(task);
  const repository = new RunRepository(bot.storage.sqlitePath);
  try {
    const result = await executeTaskDefinition(task, parameters, 'local-admin', `kfc_${taskId}`, {
      botId,
      pdWin11StateStore: repository,
      builtinTools: options.builtinTools,
    });
    for (const notification of result.notifications ?? []) {
      if (notification.chatId) {
        await deliverNotificationToChat(
          bot,
          notification,
          notification.chatId,
          options.sendFeishuNotification,
        );
        continue;
      }

      const subscriptions = repository.listCronSubscriptions(taskId);
      for (const subscription of subscriptions) {
        await deliverNotificationToChat(
          bot,
          notification,
          subscription.chatId,
          options.sendFeishuNotification,
        ).catch((error) => {
          console.error(
            JSON.stringify({
              logType: 'cron_notification_delivery_failed',
              botId: bot.botId,
              taskId,
              chatId: subscription.chatId,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        });
      }
    }
    return result;
  } finally {
    repository.close();
  }
}

async function deliverNotificationToChat(
  bot: BotConfig,
  notification: TaskNotificationIntent,
  chatId: string,
  sender: ExecuteConfiguredTaskOptions['sendFeishuNotification'],
): Promise<void> {
  await (sender ?? sendFeishuNotification)(bot, {
    ...notification,
    chatId,
  });
}

async function sendFeishuNotification(
  bot: BotConfig,
  notification: TaskNotificationIntent,
): Promise<void> {
  if (notification.channel !== 'feishu') {
    return;
  }
  if (!notification.chatId) {
    throw new Error('chatId is required for Feishu notification delivery');
  }

  const client = new sdk.Client({
    appId: bot.feishu.appId,
    appSecret: bot.feishu.appSecret,
  });

  await client.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: notification.chatId,
      content: JSON.stringify(buildNotificationCard(notification)),
      msg_type: 'interactive',
    },
  });
}

function buildNotificationCard(notification: TaskNotificationIntent): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: notification.title ?? 'Notification',
      },
    },
    elements: [
      {
        tag: 'markdown',
        content: notification.body,
      },
    ],
  };
}

async function resolveServiceInstallConfigPath(explicitPath?: string): Promise<string> {
  if (explicitPath?.trim()) {
    return explicitPath;
  }

  const configPath = defaultConfigPath();
  try {
    await access(configPath, constants.F_OK);
  } catch {
    throw new Error(`Default config not found: ${configPath}`);
  }

  return configPath;
}

async function resolveHealthConfigPath(): Promise<string> {
  if (await isServiceInstalled()) {
    return await readInstalledServiceConfigPath();
  }
  return defaultConfigPath();
}

async function resolveUpdateConfigPath(): Promise<string> {
  if (await isServiceInstalled()) {
    return await readInstalledServiceConfigPath();
  }
  return defaultConfigPath();
}

async function readServiceHealth(): Promise<AppHealthSnapshot> {
  const configPath = await resolveHealthConfigPath();
  const config = await loadConfig(configPath);
  const url = new URL(config.server.healthPath, `http://127.0.0.1:${config.server.port}`);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Unable to reach local health endpoint at ${url.toString()}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(`Health endpoint returned ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as AppHealthSnapshot;
}

function createDefaultDeps(): KfcCliDeps {
  const serviceManager = new LaunchdServiceManager();
  return {
    serviceManager,
    pairAuthorizer: async (pairCode) => {
      const configPath = defaultConfigPath();
      const config = await loadConfig(configPath);
      return await authorizePairing({
        configPath,
        pairCode,
        reload: async (botId) => {
          await invokeLocalReload({
            port: config.server.port,
            botId,
          });
        },
      });
    },
    taskExecutor: async (botId, taskId) => await executeConfiguredTask(defaultConfigPath(), botId, taskId),
    healthReader: async () => await readServiceHealth(),
    updateInspector: async () => await inspectUpdateState(),
    updatePerformer: async (inspection) =>
      await cliUpdateViaPreparedHandoff(inspection, {
        configPath: await resolveUpdateConfigPath(),
      }),
    confirmUpdate: async (prompt) => await confirmInteractive(prompt),
    rollbackInspector: async () => await inspectRollbackState(),
    rollbackPerformer: async (inspection) =>
      await cliRollbackViaPreparedHandoff(inspection, {
        configPath: await resolveUpdateConfigPath(),
      }),
    confirmRollback: async (prompt) => await confirmInteractive(prompt),
    confirmFullUninstall: async (prompt) => await confirmInteractive(prompt),
    fullUninstaller: async (deleteConfig) => await performFullUninstall(serviceManager, deleteConfig),
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

export async function runKfcCli(argv: string[], deps: KfcCliDeps = createDefaultDeps()): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command === 'service') {
      const [action, ...flagsList] = rest;
      const flags = parseFlags(flagsList);
      switch (action) {
        case 'install':
          await deps.serviceManager.install(await resolveServiceInstallConfigPath(flags['--config']));
          deps.stdout.write('Service installed\n');
          return 0;
        case 'uninstall':
          await deps.serviceManager.uninstall();
          deps.stdout.write('Service uninstalled\n');
          return 0;
        case 'start':
          await deps.serviceManager.start();
          deps.stdout.write('Service started\n');
          return 0;
        case 'restart':
          await deps.serviceManager.restart();
          deps.stdout.write('Service restarted\n');
          return 0;
        case 'stop':
          await deps.serviceManager.stop();
          deps.stdout.write('Service stopped\n');
          return 0;
        default:
          throw new Error('Usage: kfc service <install|uninstall|start|restart|stop>');
      }
    }

    if (command === 'health') {
      const snapshot = await deps.healthReader();
      deps.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
      return 0;
    }

    if (command === 'version') {
      const version = await (deps.versionReader ?? readCurrentVersionLabel)();
      deps.stdout.write(`${version}\n`);
      return 0;
    }

    if (command === 'update') {
      const flags = parseFlags(rest);
      if (!deps.updateInspector || !deps.updatePerformer || !deps.confirmUpdate) {
        throw new Error('Update workflow is not available in this CLI context.');
      }
      const inspection = await deps.updateInspector();
      if (inspection.status === 'blocked') {
        throw new Error(inspection.summary);
      }
      if (inspection.status === 'up_to_date') {
        deps.stdout.write(`${inspection.summary}\n`);
        return 0;
      }

      const confirmed = flags['--yes'] === 'true'
        ? true
        : await deps.confirmUpdate(`${inspection.summary} Continue with update? [y/N] `);
      if (!confirmed) {
        deps.stdout.write('Update cancelled\n');
        return 0;
      }

      const result = await deps.updatePerformer(inspection);
      deps.stdout.write(`${result.summary}\n`);
      return 0;
    }

    if (command === 'rollback') {
      const flags = parseFlags(rest);
      if (!deps.rollbackInspector || !deps.rollbackPerformer || !deps.confirmRollback) {
        throw new Error('Rollback workflow is not available in this CLI context.');
      }
      const inspection = await deps.rollbackInspector();
      if (inspection.status === 'blocked') {
        throw new Error(inspection.summary);
      }

      const confirmed = flags['--yes'] === 'true'
        ? true
        : await deps.confirmRollback(`${inspection.summary} Continue with rollback? [y/N] `);
      if (!confirmed) {
        deps.stdout.write('Rollback cancelled\n');
        return 0;
      }

      const result = await deps.rollbackPerformer(inspection);
      deps.stdout.write(`${result.summary}\n`);
      return 0;
    }

    if (command === 'uninstall') {
      const flags = parseFlags(rest);
      const deleteConfig = flags['--delete-config'] === 'true';
      const confirmed = flags['--yes'] === 'true'
        ? true
        : await deps.confirmFullUninstall(
            deleteConfig
              ? 'This will remove the installed app, launcher, work directory, launchd state, and the default config file. Continue? [y/N] '
              : 'This will remove the installed app, launcher, work directory, and launchd state. The default config will be preserved. Continue? [y/N] ',
          );
      if (!confirmed) {
        deps.stdout.write('Uninstall cancelled\n');
        return 0;
      }
      await deps.fullUninstaller(deleteConfig);
      deps.stdout.write(
        deleteConfig ? 'Uninstalled kfc and deleted the default config\n' : 'Uninstalled kfc and preserved the default config\n',
      );
      return 0;
    }

    if (command === 'pair') {
      const [pairCode] = rest;
      if (!pairCode) {
        throw new Error('Usage: kfc pair PAIR_CODE');
      }
      const result = await deps.pairAuthorizer(pairCode);
      deps.stdout.write(`Authorized ${result.actorId}\n`);
      return 0;
    }

    if (command === 'exec') {
      const flags = parseFlags(rest);
      const taskJson = flags['--task-json'];
      const parametersJson = flags['--parameters-json'];
      if (taskJson) {
        const task = JSON.parse(Buffer.from(taskJson, 'base64').toString('utf8')) as TaskDefinition;
        const parameters = parametersJson
          ? (JSON.parse(Buffer.from(parametersJson, 'base64').toString('utf8')) as Record<
              string,
              string | number | boolean
            >)
          : resolveDefaultParameters(task);
        const result = await executeTaskDefinition(
          task,
          parameters,
          flags['--actor'] ?? 'local-admin',
          flags['--run-id'] ?? `kfc_${task.id}`,
          {
            botId: flags['--bot-id'],
          },
        );
        deps.stdout.write(`${JSON.stringify(result)}\n`);
        return 0;
      }

      const botId = flags['--bot'];
      const taskId = flags['--task'];
      if (!botId || !taskId) {
        throw new Error('Usage: kfc exec --bot BOT_ID --task TASK_ID');
      }
      const result = await deps.taskExecutor(botId, taskId);
      deps.stdout.write(`${result.summary}\n`);
      return 0;
    }

    if (command === 'internal-run-self-refresh') {
      const flags = parseFlags(rest);
      const operationId = flags['--operation-id'];
      if (!operationId) {
        throw new Error('Usage: kfc internal-run-self-refresh --operation-id OPERATION_ID');
      }
      const result = await runDetachedServiceRefreshOperation(operationId);
      deps.stdout.write(`${result.summary}\n`);
      return 0;
    }

    throw new Error('Usage: kfc <service|health|version|update|rollback|pair|exec|uninstall> ...');
  } catch (error) {
    deps.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runKfcCli(process.argv.slice(2));
  process.exit(exitCode);
}
