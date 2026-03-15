import type {
  BuiltinToolTaskDefinition,
  PDWin11MonitorState,
  TaskResult,
  TaskTool,
} from '../domain.ts';
import { formatFeishuTimestamp } from '../feishu/timestamp.ts';
import { createPrlctlParallelsVmClient } from './parallels.ts';
import type { ParallelsVmInspection } from './parallels.ts';

interface CheckPDWin11Deps {
  inspectVm?: (name: string) => Promise<ParallelsVmInspection>;
  now?: () => Date;
}

const RUNTIME_REMINDER_THRESHOLD_MS = 60 * 60 * 1000;
const RUNTIME_REMINDER_INTERVAL_MS = 10 * 60 * 1000;

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

function resolveConfig(task: BuiltinToolTaskDefinition): {
  vmNameMatch: string;
} {
  const vmNameMatch = task.config?.vm_name_match;
  return {
    vmNameMatch:
      typeof vmNameMatch === 'string' && vmNameMatch.trim() ? vmNameMatch : 'Windows 11',
  };
}

function buildStartupResult(startTime: string, observedAt: string): TaskResult {
  const runtime = formatDuration(Date.parse(observedAt) - Date.parse(startTime));
  return {
    summary: `Windows 11 is running since ${startTime} (${runtime})`,
    notifications: [
      {
        channel: 'feishu',
        title: 'MC 启动!',
        body: `Windows 11 start time: ${formatFeishuTimestamp(startTime)}\nCurrent runtime: ${runtime}`,
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
        body: `Windows 11 shutdown time: ${formatFeishuTimestamp(shutdownTime)}\nCumulative runtime: ${runtime}`,
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
        body: `Windows 11 已运行超过 1 小时\nWindows 11 start time: ${formatFeishuTimestamp(
          startTime,
        )}\nCurrent runtime: ${runtime}`,
      },
    ],
  };
}

export function createCheckPDWin11Tool(deps: CheckPDWin11Deps = {}): TaskTool {
  const now = deps.now ?? (() => new Date());
  const client = deps.inspectVm ? undefined : createPrlctlParallelsVmClient({ now });
  const inspectVmByName = deps.inspectVm ?? client!.inspectVmByName.bind(client);

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
      const inspectedVm = await inspectVmByName(vmNameMatch);

      if (inspectedVm.state === 'off') {
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

      if (!existing || existing.state === 'off') {
        const startTime = observedAt;
        const nextState: PDWin11MonitorState = {
          state: 'on',
          detectedStartAt: startTime,
          lastTransitionAt: observedAt,
          lastNotificationAt: observedAt,
          lastRuntimeReminderAt: undefined,
        };
        context.pdWin11StateStore.savePDWin11State(task.id, nextState);
        return buildStartupResult(startTime, observedAt);
      }

      const startTime = existing.detectedStartAt ?? inspectedVm.detectedStartAt ?? observedAt;
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
