import { execFile, spawn } from 'node:child_process';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import * as sdk from '@larksuiteoapi/node-sdk';

import { defaultConfigPath } from './config/paths.ts';
import { loadConfig, validateParameters } from './config/schema.ts';
import type { BotConfig, TaskDefinition, TaskNotificationIntent, TaskResult, TaskTool } from './domain.ts';
import { authorizePairing, invokeLocalReload } from './pairing.ts';
import { createBuiltinToolRegistry } from './tools/index.ts';
import { RunRepository } from './persistence/run-repository.ts';

const execFileAsync = promisify(execFile);
const SERVICE_LABEL = 'com.kidsalfred.service';
const SERVICE_INSTALL_HINT = 'Service is not installed. Run: kfc service install --config /path/to/bot.toml';

export interface KfcServiceManager {
  install(configPath: string): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
}

export interface KfcCliDeps {
  serviceManager: KfcServiceManager;
  pairAuthorizer: (pairCode: string) => Promise<{ actorId: string; changed: boolean }>;
  taskExecutor: (botId: string, taskId: string) => Promise<TaskResult>;
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

class LaunchdServiceManager implements KfcServiceManager {
  async install(configPath: string): Promise<void> {
    const plistPath = await writeServicePlist(configPath);
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await execFileAsync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
    await execFileAsync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE_LABEL}`]);
  }

  async uninstall(): Promise<void> {
    const plistPath = servicePlistPath();
    if (!(await isServiceInstalled())) {
      return;
    }
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}/${SERVICE_LABEL}`]).catch(
      () => undefined,
    );
    await unlink(plistPath).catch(() => undefined);
  }

  async start(): Promise<void> {
    const plistPath = await ensureInstalledService();
    await execFileAsync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await execFileAsync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE_LABEL}`]);
  }

  async restart(): Promise<void> {
    const plistPath = await ensureInstalledService();
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}/${SERVICE_LABEL}`]).catch(
      () => undefined,
    );
    await execFileAsync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await execFileAsync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE_LABEL}`]);
  }

  async stop(): Promise<void> {
    await ensureInstalledService();
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}/${SERVICE_LABEL}`]).catch(() => undefined);
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

async function writeServicePlist(configPath: string): Promise<string> {
  const plistPath = servicePlistPath();
  const sourcePath = resolve(process.cwd(), 'src/index.ts');
  await mkdir(join(process.env.HOME ?? process.cwd(), 'Library', 'LaunchAgents'), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${process.execPath}</string>
      <string>--experimental-strip-types</string>
      <string>${sourcePath}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>KIDS_ALFRED_CONFIG</key>
      <string>${configPath}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>`;
  await writeFile(plistPath, plist, 'utf8');
  return plistPath;
}

function servicePlistPath(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
}

async function isServiceInstalled(): Promise<boolean> {
  try {
    await access(servicePlistPath(), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureInstalledService(): Promise<string> {
  const plistPath = servicePlistPath();
  if (!(await isServiceInstalled())) {
    throw new Error(SERVICE_INSTALL_HINT);
  }
  return plistPath;
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

function createDefaultDeps(): KfcCliDeps {
  return {
    serviceManager: new LaunchdServiceManager(),
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

    throw new Error('Usage: kfc <service|pair|exec> ...');
  } catch (error) {
    deps.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runKfcCli(process.argv.slice(2));
  process.exit(exitCode);
}
