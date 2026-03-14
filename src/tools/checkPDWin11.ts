import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  BuiltinToolTaskDefinition,
  PDWin11MonitorState,
  TaskResult,
  TaskTool,
} from '../domain.ts';

const execFileAsync = promisify(execFile);
const LSTART_LENGTH = 24;

export interface ObservedProcess {
  command: string;
  startedAt?: string;
}

interface CheckPDWin11Deps {
  listProcesses?: () => Promise<ObservedProcess[]>;
  now?: () => Date;
}

const RUNTIME_REMINDER_THRESHOLD_MS = 60 * 60 * 1000;
const RUNTIME_REMINDER_INTERVAL_MS = 10 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}小时`);
  }
  if (minutes > 0 || hours === 0) {
    parts.push(`${minutes}分`);
  }
  return parts.join('');
}

function parsePsOutput(stdout: string): ObservedProcess[] {
  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const header = line.slice(0, LSTART_LENGTH).trim();
      const command = line.slice(LSTART_LENGTH).trim();
      const parsed = header ? new Date(header) : undefined;
      return {
        command,
        startedAt:
          parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString() : undefined,
      };
    });
}

async function listProcesses(): Promise<ObservedProcess[]> {
  const { stdout } = await execFileAsync('ps', ['-axo', 'lstart=,command=']);
  return parsePsOutput(stdout);
}

function resolveConfig(task: BuiltinToolTaskDefinition): {
  vmNameMatch: string;
} {
  const vmNameMatch = task.config?.vm_name_match;
  return {
    vmNameMatch: typeof vmNameMatch === 'string' && vmNameMatch.trim() ? vmNameMatch : 'Windows 11',
  };
}

function findMatchingProcess(
  processes: ObservedProcess[],
  vmNameMatch: string,
): ObservedProcess | undefined {
  const vmNameFlag = `--vm-name ${vmNameMatch}`;
  const matches = processes
    .filter(
      (process) =>
        process.command.includes('prl_vm_app') && process.command.includes(vmNameFlag),
    )
    .sort((left, right) => {
      const leftTime = left.startedAt ? Date.parse(left.startedAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.startedAt ? Date.parse(right.startedAt) : Number.POSITIVE_INFINITY;
      return leftTime - rightTime;
    });

  if (matches.length === 0) {
    return undefined;
  }
  if (!matches[0].startedAt) {
    throw new Error('Unable to parse Windows 11 process start time');
  }
  return matches[0];
}

function buildStartupResult(startTime: string, observedAt: string): TaskResult {
  const runtime = formatDuration(Date.parse(observedAt) - Date.parse(startTime));
  return {
    summary: `Windows 11 is running since ${startTime} (${runtime})`,
    notifications: [
      {
        channel: 'feishu',
        title: 'MC 启动!',
        body: `Windows 11 start time: ${formatTimestamp(startTime)}\nCurrent runtime: ${runtime}`,
      },
    ],
  };
}

function buildShutdownResult(startTime: string, shutdownTime: string): TaskResult {
  const runtime = formatDuration(Date.parse(shutdownTime) - Date.parse(startTime));
  return {
    summary: `Windows 11 shut down at ${shutdownTime} (${runtime})`,
    notifications: [
      {
        channel: 'feishu',
        title: 'MC 下线!',
        body: `Windows 11 shutdown time: ${formatTimestamp(shutdownTime)}\nCumulative runtime: ${runtime}`,
      },
    ],
  };
}

function buildRuntimeReminderResult(startTime: string, observedAt: string): TaskResult {
  const runtime = formatDuration(Date.parse(observedAt) - Date.parse(startTime));
  return {
    summary: `Windows 11 has been running for ${runtime}`,
    notifications: [
      {
        channel: 'feishu',
        title: `MC 已运行 ${runtime}`,
        body: `Windows 11 已运行超过 1 小时\nWindows 11 start time: ${formatTimestamp(
          startTime,
        )}\nCurrent runtime: ${runtime}`,
      },
    ],
  };
}

export function createCheckPDWin11Tool(deps: CheckPDWin11Deps = {}): TaskTool {
  const loadProcesses = deps.listProcesses ?? listProcesses;
  const now = deps.now ?? (() => new Date());

  return {
    id: 'checkPDWin11',
    async execute(context) {
      context.signal.throwIfAborted();
      if (context.task.runnerKind !== 'builtin-tool') {
        throw new Error('checkPDWin11 requires a builtin-tool task definition');
      }
      if (!context.pdWin11StateStore) {
        throw new Error('checkPDWin11 requires PDWin11 state storage');
      }

      const task = context.task as BuiltinToolTaskDefinition;
      const { vmNameMatch } = resolveConfig(task);
      const observedAt = now().toISOString();
      const existing = context.pdWin11StateStore.getPDWin11State(task.id);
      const matchingProcess = findMatchingProcess(await loadProcesses(), vmNameMatch);

      if (!matchingProcess) {
        if (!existing) {
          context.pdWin11StateStore.savePDWin11State(task.id, {
            state: 'off',
            lastTransitionAt: observedAt,
          });
          return {
            summary: 'Windows 11 is off',
          };
        }

        if (existing.state === 'on') {
          if (!existing.detectedStartAt) {
            throw new Error('Stored Windows 11 state is missing start time');
          }
          const nextState: PDWin11MonitorState = {
            state: 'off',
            lastTransitionAt: observedAt,
            lastNotificationAt: observedAt,
            lastRuntimeReminderAt: undefined,
          };
          context.pdWin11StateStore.savePDWin11State(task.id, nextState);
          return buildShutdownResult(existing.detectedStartAt, observedAt);
        }

        return {
          summary: 'Windows 11 is off',
        };
      }

      if (!matchingProcess.startedAt) {
        throw new Error('Unable to parse Windows 11 process start time');
      }

      if (!existing || existing.state === 'off') {
        const nextState: PDWin11MonitorState = {
          state: 'on',
          detectedStartAt: matchingProcess.startedAt,
          lastTransitionAt: observedAt,
          lastNotificationAt: observedAt,
          lastRuntimeReminderAt: undefined,
        };
        context.pdWin11StateStore.savePDWin11State(task.id, nextState);
        return buildStartupResult(matchingProcess.startedAt, observedAt);
      }

      const startTime = existing.detectedStartAt ?? matchingProcess.startedAt;
      const uptimeMs = Date.parse(observedAt) - Date.parse(startTime);
      if (uptimeMs >= RUNTIME_REMINDER_THRESHOLD_MS) {
        const lastReminderMs = existing.lastRuntimeReminderAt
          ? Date.parse(existing.lastRuntimeReminderAt)
          : undefined;
        if (
          lastReminderMs === undefined ||
          Date.parse(observedAt) - lastReminderMs >= RUNTIME_REMINDER_INTERVAL_MS
        ) {
          context.pdWin11StateStore.savePDWin11State(task.id, {
            ...existing,
            state: 'on',
            detectedStartAt: startTime,
            lastRuntimeReminderAt: observedAt,
            lastNotificationAt: observedAt,
          });
          return buildRuntimeReminderResult(startTime, observedAt);
        }
      }

      return {
        summary: `Windows 11 is running since ${startTime}`,
      };
    },
  };
}
