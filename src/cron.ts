import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { defaultConfigPath, resolveAppEntrypoint } from './config/paths.ts';
import type { BotConfig, CronJobRecord, CronObservedState, TaskDefinition } from './domain.ts';
import { RunRepository } from './persistence/run-repository.ts';

const execFileAsync = promisify(execFile);

export interface CronController {
  list(): Promise<CronJobRecord[]>;
  start(taskId: string): Promise<CronJobRecord>;
  stop(taskId: string): Promise<CronJobRecord>;
  reconcile(): Promise<void>;
}

export interface LaunchdAdapter {
  status(label: string): Promise<CronObservedState>;
  start(plistPath: string, label: string): Promise<void>;
  stop(plistPath: string, label: string): Promise<void>;
}

export function parseLaunchdPrintState(output: string): CronObservedState {
  const normalized = output.toLowerCase();
  if (normalized.includes('state = running')) {
    return 'running';
  }
  if (normalized.includes('state = not running')) {
    return 'stopped';
  }
  return 'unknown';
}

class SystemLaunchdAdapter implements LaunchdAdapter {
  async status(label: string): Promise<CronObservedState> {
    try {
      const { stdout } = await execFileAsync('launchctl', [
        'print',
        `gui/${process.getuid()}/${label}`,
      ]);
      return parseLaunchdPrintState(stdout);
    } catch {
      return 'stopped';
    }
  }

  async start(plistPath: string, label: string): Promise<void> {
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
    await execFileAsync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
    await execFileAsync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${label}`]);
  }

  async stop(plistPath: string, _label: string): Promise<void> {
    await execFileAsync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]).catch(
      () => undefined,
    );
  }
}

export class MemoryCronController implements CronController {
  private readonly botId: string;
  private readonly tasks: Record<string, TaskDefinition>;
  private readonly repository: RunRepository;

  constructor(botId: string, tasks: Record<string, TaskDefinition>, repository: RunRepository) {
    this.botId = botId;
    this.tasks = tasks;
    this.repository = repository;
  }

  async list(): Promise<CronJobRecord[]> {
    for (const task of Object.values(this.tasks)) {
      if (task.executionMode !== 'cronjob' || !task.cron) {
        continue;
      }
      this.repository.upsertCronJob({
        taskId: task.id,
        launchdLabel: buildLaunchdLabel(this.botId, task.id),
        schedule: task.cron.schedule,
        autoStart: task.cron.autoStart,
        desiredState: task.cron.autoStart ? 'started' : 'stopped',
        observedState: this.repository.getCronJob(task.id)?.observedState ?? 'unknown',
      });
    }
    return this.repository.listCronJobs();
  }

  async start(taskId: string): Promise<CronJobRecord> {
    const task = this.getCronTask(taskId);
    const current = this.repository.getCronJob(taskId);
    if (current?.observedState === 'running') {
      return this.repository.upsertCronJob({
        taskId,
        launchdLabel: buildLaunchdLabel(this.botId, taskId),
        schedule: task.cron!.schedule,
        autoStart: task.cron!.autoStart,
        desiredState: 'started',
        observedState: 'running',
        lastStartedAt: current.lastStartedAt,
        lastStoppedAt: current.lastStoppedAt,
        lastError: current.lastError,
      });
    }
    return this.repository.upsertCronJob({
      taskId,
      launchdLabel: buildLaunchdLabel(this.botId, taskId),
      schedule: task.cron!.schedule,
      autoStart: task.cron!.autoStart,
      desiredState: 'started',
      observedState: 'running',
      lastStartedAt: new Date().toISOString(),
    });
  }

  async stop(taskId: string): Promise<CronJobRecord> {
    const task = this.getCronTask(taskId);
    return this.repository.upsertCronJob({
      taskId,
      launchdLabel: buildLaunchdLabel(this.botId, taskId),
      schedule: task.cron!.schedule,
      autoStart: task.cron!.autoStart,
      desiredState: 'stopped',
      observedState: 'stopped',
      lastStoppedAt: new Date().toISOString(),
    });
  }

  async reconcile(): Promise<void> {
    for (const task of Object.values(this.tasks)) {
      if (task.executionMode !== 'cronjob' || !task.cron) {
        continue;
      }
      await (task.cron.autoStart ? this.start(task.id) : this.stop(task.id));
    }
  }

  private getCronTask(taskId: string): TaskDefinition {
    const task = this.tasks[taskId];
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (task.executionMode !== 'cronjob' || !task.cron) {
      throw new Error(`Task mode mismatch: ${taskId} is not a cronjob task`);
    }
    return task;
  }
}

export class LaunchdCronController implements CronController {
  private readonly config: BotConfig;
  private readonly repository: RunRepository;
  private readonly launchd: LaunchdAdapter;
  private readonly kfcScriptPath: string;

  constructor(
    config: BotConfig,
    repository: RunRepository,
    options: {
      launchd?: LaunchdAdapter;
      kfcScriptPath?: string;
      configPath?: string;
    } = {},
  ) {
    this.config = config;
    this.repository = repository;
    this.launchd = options.launchd ?? new SystemLaunchdAdapter();
    this.kfcScriptPath = options.kfcScriptPath ?? resolveAppEntrypoint('src/kfc.ts');
    this.configPath = options.configPath ?? config.sourcePath ?? defaultConfigPath();
  }
  private readonly configPath: string;

  async list(): Promise<CronJobRecord[]> {
    const records: CronJobRecord[] = [];
    for (const task of this.cronTasks()) {
      const label = buildLaunchdLabel(this.config.botId, task.id);
      const observedState = await this.launchd.status(label);
      records.push(
        this.repository.upsertCronJob({
          taskId: task.id,
          launchdLabel: label,
          schedule: task.cron!.schedule,
          autoStart: task.cron!.autoStart,
          desiredState: task.cron!.autoStart ? 'started' : 'stopped',
          observedState,
        }),
      );
    }
    return records;
  }

  async start(taskId: string): Promise<CronJobRecord> {
    const task = this.getCronTask(taskId);
    const label = buildLaunchdLabel(this.config.botId, taskId);
    const plistPath = this.writePlist(task);
    const running = (await this.launchd.status(label)) === 'running';
    const current = this.repository.getCronJob(taskId);
    if (!running) {
      await this.launchd.stop(plistPath, label).catch(() => undefined);
      await this.launchd.start(plistPath, label);
    }
    return this.repository.upsertCronJob({
      taskId,
      launchdLabel: label,
      schedule: task.cron!.schedule,
      autoStart: task.cron!.autoStart,
      desiredState: 'started',
      observedState: 'running',
      lastStartedAt: running ? current?.lastStartedAt : new Date().toISOString(),
      lastStoppedAt: current?.lastStoppedAt,
      lastError: current?.lastError,
    });
  }

  async stop(taskId: string): Promise<CronJobRecord> {
    const task = this.getCronTask(taskId);
    const label = buildLaunchdLabel(this.config.botId, taskId);
    const plistPath = this.plistPathFor(taskId);
    await this.launchd.stop(plistPath, label);
    return this.repository.upsertCronJob({
      taskId,
      launchdLabel: label,
      schedule: task.cron!.schedule,
      autoStart: task.cron!.autoStart,
      desiredState: 'stopped',
      observedState: 'stopped',
      lastStoppedAt: new Date().toISOString(),
    });
  }

  async reconcile(): Promise<void> {
    for (const task of this.cronTasks()) {
      const label = buildLaunchdLabel(this.config.botId, task.id);
      const plistPath = this.writePlist(task);
      const running = (await this.launchd.status(label)) === 'running';
      if (task.cron!.autoStart) {
        if (running) {
          await this.launchd.stop(plistPath, label);
        }
        await this.launchd.start(plistPath, label);
        this.repository.upsertCronJob({
          taskId: task.id,
          launchdLabel: label,
          schedule: task.cron!.schedule,
          autoStart: true,
          desiredState: 'started',
          observedState: 'running',
          lastStartedAt: new Date().toISOString(),
        });
        continue;
      }

      if (running) {
        await this.launchd.stop(plistPath, label);
      }
      this.repository.upsertCronJob({
        taskId: task.id,
        launchdLabel: label,
        schedule: task.cron!.schedule,
        autoStart: false,
        desiredState: 'stopped',
        observedState: 'stopped',
        lastStoppedAt: new Date().toISOString(),
      });
    }
  }

  private cronTasks(): TaskDefinition[] {
    return Object.values(this.config.tasks).filter((task) => task.executionMode === 'cronjob');
  }

  private getCronTask(taskId: string): TaskDefinition {
    const task = this.config.tasks[taskId];
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (task.executionMode !== 'cronjob' || !task.cron) {
      throw new Error(`Task mode mismatch: ${taskId} is not a cronjob task`);
    }
    return task;
  }

  private plistPathFor(taskId: string): string {
    const dir = join(dirname(this.config.storage.sqlitePath), 'launchd');
    mkdirSync(dir, { recursive: true });
    return cronLaunchdPlistPath(this.config.storage.sqlitePath, this.config.botId, taskId);
  }

  private writePlist(task: TaskDefinition): string {
    const plistPath = this.plistPathFor(task.id);
    writeFileSync(
      plistPath,
      buildLaunchdPlist({
        label: buildLaunchdLabel(this.config.botId, task.id),
        programArguments: [
          process.execPath,
          '--experimental-strip-types',
          this.kfcScriptPath,
          'exec',
          '--bot',
          this.config.botId,
          '--task',
          task.id,
        ],
        schedule: task.cron!.schedule,
        environmentVariables: {
          KIDS_ALFRED_CONFIG: this.configPath,
        },
      }),
      'utf8',
    );
    return plistPath;
  }
}

export function buildLaunchdLabel(botId: string, taskId: string): string {
  return `com.kidsalfred.${botId}.${taskId}`;
}

export function cronLaunchdPlistPath(sqlitePath: string, botId: string, taskId: string): string {
  return join(dirname(sqlitePath), 'launchd', `${buildLaunchdLabel(botId, taskId)}.plist`);
}

function buildLaunchdPlist(input: {
  label: string;
  programArguments: string[];
  schedule: string;
  environmentVariables?: Record<string, string>;
}): string {
  const schedule = translateCronToLaunchd(input.schedule);
  const startCalendarInterval = Array.isArray(schedule) ? schedule : [schedule];
  const intervalsXml = startCalendarInterval
    .map(
      (entry) => `
      <dict>
        ${entry.Minute !== undefined ? `<key>Minute</key><integer>${entry.Minute}</integer>` : ''}
        ${entry.Hour !== undefined ? `<key>Hour</key><integer>${entry.Hour}</integer>` : ''}
      </dict>`,
    )
    .join('\n');
  const argumentsXml = input.programArguments
    .map((argument) => `<string>${argument}</string>`)
    .join('\n');
  const environmentVariablesXml = input.environmentVariables
    ? `
    <key>EnvironmentVariables</key>
    <dict>
      ${Object.entries(input.environmentVariables)
        .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
        .join('\n      ')}
    </dict>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${input.label}</string>
    <key>ProgramArguments</key>
    <array>
      ${argumentsXml}
    </array>
    ${environmentVariablesXml}
    <key>StartCalendarInterval</key>
    <array>
      ${intervalsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>`;
}

type LaunchdSchedule = { Minute?: number; Hour?: number } | Array<{ Minute?: number; Hour?: number }>;

export function translateCronToLaunchd(schedule: string): LaunchdSchedule {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.trim().split(/\s+/u);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    throw new Error(`Invalid cron schedule: ${schedule}`);
  }
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') {
    throw new Error(`Unsupported cron schedule for launchd translation: ${schedule}`);
  }

  if (/^\d+$/u.test(minute) && /^\d+$/u.test(hour)) {
    return {
      Minute: Number(minute),
      Hour: Number(hour),
    };
  }

  if (/^\d+$/u.test(minute) && hour === '*') {
    return {
      Minute: Number(minute),
    };
  }

  if (/^\d+$/u.test(minute) && /^\*\/\d+$/u.test(hour)) {
    const step = Number(hour.split('/')[1]);
    return Array.from({ length: Math.ceil(24 / step) }, (_value, index) => ({
      Minute: Number(minute),
      Hour: index * step,
    })).filter((entry) => entry.Hour! < 24);
  }

  if (/^\*\/\d+$/u.test(minute) && hour === '*') {
    const step = Number(minute.split('/')[1]);
    if (60 % step !== 0) {
      throw new Error(`Unsupported cron schedule for launchd translation: ${schedule}`);
    }
    return Array.from({ length: 60 / step }, (_value, index) => ({
      Minute: index * step,
    }));
  }

  throw new Error(`Unsupported cron schedule for launchd translation: ${schedule}`);
}
