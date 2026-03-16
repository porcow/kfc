import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { resolveAppEntrypoint, resolveBunExecutablePath } from './config/paths.ts';
import { loadConfig } from './config/schema.ts';
import { buildLaunchdLabel, cronLaunchdPlistPath } from './cron.ts';

const execFileAsync = promisify(execFile);

export const SERVICE_LABEL = 'com.kidsalfred.service';
export const SERVICE_INSTALL_HINT =
  'Service is not installed. Run: kfc service install [--config /path/to/bot.toml]';

export interface KfcServiceManager {
  install(configPath: string): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
}

export interface CronCleanupTarget {
  botId: string;
  taskId: string;
  label: string;
  plistPath: string;
}

interface LaunchdServiceManagerOptions {
  execFileAsync?: typeof execFileAsync;
  access?: typeof access;
  readdir?: typeof readdir;
  readFile?: typeof readFile;
  unlink?: typeof unlink;
  loadConfig?: typeof loadConfig;
}

export class LaunchdServiceManager implements KfcServiceManager {
  private readonly execFileAsyncImpl: typeof execFileAsync;
  private readonly accessImpl: typeof access;
  private readonly readdirImpl: typeof readdir;
  private readonly readFileImpl: typeof readFile;
  private readonly unlinkImpl: typeof unlink;
  private readonly loadConfigImpl: typeof loadConfig;

  constructor(options: LaunchdServiceManagerOptions = {}) {
    this.execFileAsyncImpl = options.execFileAsync ?? execFileAsync;
    this.accessImpl = options.access ?? access;
    this.readdirImpl = options.readdir ?? readdir;
    this.readFileImpl = options.readFile ?? readFile;
    this.unlinkImpl = options.unlink ?? unlink;
    this.loadConfigImpl = options.loadConfig ?? loadConfig;
  }

  async install(configPath: string): Promise<void> {
    const plistPath = await writeServicePlist(configPath);
    await this.execFileAsyncImpl('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await this.execFileAsyncImpl('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
    await this.execFileAsyncImpl('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE_LABEL}`]);
  }

  async uninstall(): Promise<void> {
    const plistPath = servicePlistPath();
    const cleanupErrors: string[] = [];
    const cronTargets = await this.collectCronCleanupTargets(plistPath, cleanupErrors);
    cleanupErrors.push(
      ...(await cleanupCronLaunchdJobs(cronTargets, {
        execFileAsync: this.execFileAsyncImpl,
        unlink: this.unlinkImpl,
      })),
    );

    await this.execFileAsyncImpl('launchctl', ['bootout', `gui/${process.getuid()}/${SERVICE_LABEL}`]).catch(
      () => undefined,
    );
    await this.unlinkImpl(plistPath).catch(() => undefined);
    if (cleanupErrors.length > 0) {
      throw new Error(`Service uninstalled with cron cleanup issues:\n- ${cleanupErrors.join('\n- ')}`);
    }
  }

  async start(): Promise<void> {
    const plistPath = await ensureInstalledService(this.accessImpl);
    await this.execFileAsyncImpl('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await this.execFileAsyncImpl('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE_LABEL}`]);
  }

  async restart(): Promise<void> {
    const plistPath = await ensureInstalledService(this.accessImpl);
    await this.execFileAsyncImpl('launchctl', ['bootout', `gui/${process.getuid()}/${SERVICE_LABEL}`]).catch(
      () => undefined,
    );
    await this.execFileAsyncImpl('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await this.execFileAsyncImpl('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${SERVICE_LABEL}`]);
  }

  async stop(): Promise<void> {
    await ensureInstalledService(this.accessImpl);
    await this.execFileAsyncImpl('launchctl', ['bootout', `gui/${process.getuid()}/${SERVICE_LABEL}`]).catch(
      () => undefined,
    );
  }

  private async collectCronCleanupTargets(
    plistPath: string,
    cleanupErrors: string[],
  ): Promise<CronCleanupTarget[]> {
    const targets: CronCleanupTarget[] = [];
    const discoveryErrors: string[] = [];
    const seen = new Set<string>();
    const includeTargets = (entries: CronCleanupTarget[]) => {
      for (const entry of entries) {
        if (seen.has(entry.plistPath)) {
          continue;
        }
        seen.add(entry.plistPath);
        targets.push(entry);
      }
    };

    const serviceInstalled = await isServiceInstalled(this.accessImpl);
    if (serviceInstalled) {
      const installedConfigPath = await readInstalledServiceConfigPath(plistPath, this.readFileImpl).catch(
        (error) => {
          discoveryErrors.push(
            `Unable to resolve installed config for cron cleanup: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return undefined;
        },
      );
      if (installedConfigPath) {
        const configuredTargets = await listCronCleanupTargets(installedConfigPath, this.loadConfigImpl).catch(
          (error) => {
            discoveryErrors.push(
              `Unable to enumerate configured cronjobs from ${installedConfigPath}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return [];
          },
        );
        includeTargets(configuredTargets);
      }
    }

    const fallbackTargets = await scanFallbackCronCleanupTargets(this.readdirImpl).catch((error) => {
      discoveryErrors.push(
        `Unable to scan fallback cronjob plists under ${workDirPath()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    });
    includeTargets(fallbackTargets);
    if (targets.length === 0 || fallbackTargets.length === 0) {
      cleanupErrors.push(...discoveryErrors);
    }
    return targets;
  }
}

async function writeServicePlist(configPath: string): Promise<string> {
  const plistPath = servicePlistPath();
  const sourcePath = resolveAppEntrypoint('src/index.ts');
  const bunPath = resolveBunExecutablePath();
  await mkdir(join(process.env.HOME ?? process.cwd(), 'Library', 'LaunchAgents'), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${bunPath}</string>
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

export function servicePlistPath(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
}

export async function isServiceInstalled(accessImpl: typeof access = access): Promise<boolean> {
  try {
    await accessImpl(servicePlistPath(), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureInstalledService(accessImpl: typeof access = access): Promise<string> {
  const plistPath = servicePlistPath();
  if (!(await isServiceInstalled(accessImpl))) {
    throw new Error(SERVICE_INSTALL_HINT);
  }
  return plistPath;
}

export async function readInstalledServiceConfigPath(
  plistPath: string = servicePlistPath(),
  readFileImpl: typeof readFile = readFile,
): Promise<string> {
  const plist = await readFileImpl(plistPath, 'utf8');
  const match = plist.match(/<key>KIDS_ALFRED_CONFIG<\/key>\s*<string>([^<]+)<\/string>/u);
  if (!match?.[1]) {
    throw new Error(`Installed service plist does not declare KIDS_ALFRED_CONFIG: ${plistPath}`);
  }
  return match[1];
}

export async function listCronCleanupTargets(
  configPath: string,
  loadConfigImpl: typeof loadConfig = loadConfig,
): Promise<CronCleanupTarget[]> {
  const config = await loadConfigImpl(configPath);
  const targets: CronCleanupTarget[] = [];
  for (const bot of Object.values(config.bots)) {
    for (const task of Object.values(bot.tasks)) {
      if (task.executionMode !== 'cronjob') {
        continue;
      }
      targets.push({
        botId: bot.botId,
        taskId: task.id,
        label: buildLaunchdLabel(bot.botId, task.id),
        plistPath: cronLaunchdPlistPath(bot.storage.sqlitePath, bot.botId, task.id),
      });
    }
  }
  return targets;
}

export async function cleanupCronLaunchdJobs(
  targets: CronCleanupTarget[],
  options: {
    execFileAsync?: typeof execFileAsync;
    unlink?: typeof unlink;
  } = {},
): Promise<string[]> {
  const execImpl = options.execFileAsync ?? execFileAsync;
  const unlinkImpl = options.unlink ?? unlink;
  const cleanupErrors: string[] = [];
  for (const target of targets) {
    await execImpl('launchctl', ['bootout', `gui/${process.getuid()}`, target.plistPath]).catch(
      (error) => {
        cleanupErrors.push(
          `Failed to unload cronjob ${target.label}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
    await unlinkImpl(target.plistPath).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      cleanupErrors.push(
        `Failed to remove cronjob plist ${target.plistPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
  return cleanupErrors;
}

export function workDirPath(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, '.kfc');
}

async function scanFallbackCronCleanupTargets(
  readdirImpl: typeof readdir = readdir,
): Promise<CronCleanupTarget[]> {
  const matches: CronCleanupTarget[] = [];
  await walkLaunchdTrees(workDirPath(), readdirImpl, matches);
  return matches;
}

async function walkLaunchdTrees(
  directory: string,
  readdirImpl: typeof readdir,
  matches: CronCleanupTarget[],
): Promise<void> {
  let entries;
  try {
    entries = await readdirImpl(directory, { withFileTypes: true });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkLaunchdTrees(entryPath, readdirImpl, matches);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!entryPath.includes('/launchd/') || !entry.name.endsWith('.plist')) {
      continue;
    }
    if (!entry.name.startsWith('com.kidsalfred.') || entry.name === `${SERVICE_LABEL}.plist`) {
      continue;
    }
    matches.push({
      botId: 'unknown',
      taskId: 'unknown',
      label: entry.name.slice(0, -'.plist'.length),
      plistPath: entryPath,
    });
  }
}
