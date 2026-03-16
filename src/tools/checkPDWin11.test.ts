import { test } from '../test-compat.ts';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PDWin11MonitorStateStore } from '../domain.ts';
import { formatFeishuTimestamp } from '../feishu/timestamp.ts';
import { RunRepository } from '../persistence/run-repository.ts';
import { createCheckPDWin11Tool } from './checkPDWin11.ts';

class MemoryPDWin11StateStore implements PDWin11MonitorStateStore {
  stateByTaskId = new Map<
    string,
    {
      state: 'off' | 'on';
      detectedStartAt?: string;
      lastTransitionAt: string;
      lastNotificationAt?: string;
      lastRuntimeReminderAt?: string;
    }
  >();

  getPDWin11State(taskId: string) {
    return this.stateByTaskId.get(taskId);
  }

  savePDWin11State(
    taskId: string,
    state: {
      state: 'off' | 'on';
      detectedStartAt?: string;
      lastTransitionAt: string;
      lastNotificationAt?: string;
      lastRuntimeReminderAt?: string;
    },
  ) {
    this.stateByTaskId.set(taskId, state);
    return state;
  }
}

test('checkPDWin11 emits startup and shutdown notifications only on transitions', async () => {
  const store = new MemoryPDWin11StateStore();
  const observedAt = new Date('2026-03-13T08:10:00.000Z');
  let invocation = 0;
  const tool = createCheckPDWin11Tool({
    now: () => observedAt,
    inspectVm: async () => {
      invocation += 1;
      if (invocation === 1 || invocation === 2) {
        return {
          id: 'vm-1',
          name: 'Windows 11',
          rawState: 'running',
          state: 'on',
          detectedStartAt: '2026-03-13T08:00:00.000Z',
        };
      }
      return {
        id: 'vm-1',
        name: 'Windows 11',
        rawState: 'stopped',
        state: 'off',
      };
    },
  });

  const task = {
    id: 'check-pd',
    runnerKind: 'builtin-tool' as const,
    executionMode: 'cronjob' as const,
    description: 'Check Windows 11 VM',
    tool: 'checkPDWin11',
    timeoutMs: 5000,
    cancellable: false,
    parameters: {},
    cron: {
      schedule: '*/5 * * * *',
      autoStart: true,
    },
    config: {
      vm_name_match: 'Windows 11',
    },
  };

  const startup = await tool.execute({
    runId: 'run_1',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });

  assert.equal(startup.notifications?.length, 1);
  assert.equal(startup.notifications?.[0].chatId, undefined);
  assert.match(startup.notifications?.[0].body ?? '', /Windows 11 start time/u);
  assert.equal(store.getPDWin11State('check-pd')?.state, 'on');

  const steady = await tool.execute({
    runId: 'run_2',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });

  assert.equal(steady.notifications?.length ?? 0, 0);

  const shutdown = await tool.execute({
    runId: 'run_3',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });

  assert.equal(shutdown.notifications?.length, 1);
  assert.match(shutdown.notifications?.[0].body ?? '', /Windows 11 shutdown time/u);
  assert.equal(store.getPDWin11State('check-pd')?.state, 'off');
});

test('checkPDWin11 uses the observation time as startup time on off to on transitions', async () => {
  const store = new MemoryPDWin11StateStore();
  const observedAt = new Date('2026-03-15T09:30:00.000Z');
  const tool = createCheckPDWin11Tool({
    now: () => observedAt,
    inspectVm: async () => ({
      id: 'vm-1',
      name: 'Windows 11',
      rawState: 'running',
      state: 'on',
      detectedStartAt: '2025-12-24T16:00:14.420Z',
    }),
  });

  const result = await tool.execute({
    runId: 'run_startup_now',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task: {
      id: 'check-pd',
      runnerKind: 'builtin-tool',
      executionMode: 'cronjob',
      description: 'Check Windows 11 VM',
      tool: 'checkPDWin11',
      timeoutMs: 5000,
      cancellable: false,
      parameters: {},
      cron: {
        schedule: '*/5 * * * *',
        autoStart: true,
      },
      config: {
        vm_name_match: 'Windows 11',
      },
    },
    parameters: {},
    pdWin11StateStore: store,
  });

  assert.equal(store.getPDWin11State('check-pd')?.detectedStartAt, '2026-03-15T09:30:00.000Z');
  assert.match(
    result.notifications?.[0].body ?? '',
    new RegExp(formatFeishuTimestamp('2026-03-15T09:30:00.000Z'), 'u'),
  );
  assert.match(result.notifications?.[0].body ?? '', /Current runtime: 0分/u);
});

test('checkPDWin11 emits first-hour and repeated ten-minute runtime reminders', async () => {
  const store = new MemoryPDWin11StateStore();
  const startTime = '2026-03-13T08:00:00.000Z';
  const observationTimes = [
    new Date('2026-03-13T08:59:00.000Z'),
    new Date('2026-03-13T09:00:00.000Z'),
    new Date('2026-03-13T09:09:00.000Z'),
    new Date('2026-03-13T09:10:00.000Z'),
  ];
  let nowIndex = 0;
  const task = {
    id: 'check-pd',
    runnerKind: 'builtin-tool' as const,
    executionMode: 'cronjob' as const,
    description: 'Check Windows 11 VM',
    tool: 'checkPDWin11',
    timeoutMs: 5000,
    cancellable: false,
    parameters: {},
    cron: {
      schedule: '*/1 * * * *',
      autoStart: true,
    },
    config: {
      vm_name_match: 'Windows 11',
    },
  };
  const tool = createCheckPDWin11Tool({
    now: () => observationTimes[nowIndex++],
    inspectVm: async () => ({
      id: 'vm-1',
      name: 'Windows 11',
      rawState: 'running',
      state: 'on',
      detectedStartAt: startTime,
    }),
  });

  store.savePDWin11State('check-pd', {
    state: 'on',
    detectedStartAt: startTime,
    lastTransitionAt: startTime,
    lastNotificationAt: startTime,
  });

  const beforeThreshold = await tool.execute({
    runId: 'run_7',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });
  assert.equal(beforeThreshold.notifications?.length ?? 0, 0);

  const firstReminder = await tool.execute({
    runId: 'run_8',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });
  assert.equal(firstReminder.notifications?.length, 1);
  assert.equal(firstReminder.notifications?.[0].title, 'MC 已运行 1小时');
  assert.match(firstReminder.notifications?.[0].body ?? '', /Windows 11 已运行超过 1 小时/u);
  assert.match(
    firstReminder.notifications?.[0].body ?? '',
    new RegExp(formatFeishuTimestamp(startTime), 'u'),
  );
  assert.equal(
    store.getPDWin11State('check-pd')?.lastRuntimeReminderAt,
    '2026-03-13T09:00:00.000Z',
  );

  const suppressedReminder = await tool.execute({
    runId: 'run_9',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });
  assert.equal(suppressedReminder.notifications?.length ?? 0, 0);

  const repeatedReminder = await tool.execute({
    runId: 'run_10',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task,
    parameters: {},
    pdWin11StateStore: store,
  });
  assert.equal(repeatedReminder.notifications?.length, 1);
  assert.equal(repeatedReminder.notifications?.[0].title, 'MC 已运行 1小时10分');
  assert.equal(
    store.getPDWin11State('check-pd')?.lastRuntimeReminderAt,
    '2026-03-13T09:10:00.000Z',
  );
});

test('checkPDWin11 leaves state unchanged when prlctl inspection fails', async () => {
  const store = new MemoryPDWin11StateStore();
  store.savePDWin11State('check-pd', {
    state: 'off',
    lastTransitionAt: '2026-03-13T07:00:00.000Z',
  });
  const tool = createCheckPDWin11Tool({
    now: () => new Date('2026-03-13T08:10:00.000Z'),
    inspectVm: async () => {
      throw new Error('Parallels CLI prlctl is not available on this host');
    },
  });

  await assert.rejects(
    () =>
      tool.execute({
        runId: 'run_4',
        botId: 'ops',
        signal: new AbortController().signal,
        actorId: 'local-admin',
        task: {
          id: 'check-pd',
          runnerKind: 'builtin-tool',
          executionMode: 'cronjob',
          description: 'Check Windows 11 VM',
          tool: 'checkPDWin11',
          timeoutMs: 5000,
          cancellable: false,
          parameters: {},
          cron: {
            schedule: '*/5 * * * *',
            autoStart: true,
          },
          config: {
            vm_name_match: 'Windows 11',
          },
        },
        parameters: {},
        pdWin11StateStore: store,
      }),
    /prlctl is not available/u,
  );

  assert.equal(store.getPDWin11State('check-pd')?.state, 'off');
});

test('checkPDWin11 state persists across repository reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pd-state-'));
  const databasePath = join(directory, 'ops.sqlite');
  const tool = createCheckPDWin11Tool({
    now: () => new Date('2026-03-13T08:10:00.000Z'),
    inspectVm: async () => ({
      id: 'vm-1',
      name: 'Windows 11',
      rawState: 'running',
      state: 'on',
      detectedStartAt: '2026-03-13T08:00:00.000Z',
    }),
  });

  const firstRepository = new RunRepository(databasePath);
  await tool.execute({
    runId: 'run_5',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task: {
      id: 'check-pd',
      runnerKind: 'builtin-tool',
      executionMode: 'cronjob',
      description: 'Check Windows 11 VM',
      tool: 'checkPDWin11',
      timeoutMs: 5000,
      cancellable: false,
      parameters: {},
      cron: {
        schedule: '*/5 * * * *',
        autoStart: true,
      },
      config: {
        vm_name_match: 'Windows 11',
      },
    },
    parameters: {},
    pdWin11StateStore: firstRepository,
  });
  firstRepository.close();

  const secondRepository = new RunRepository(databasePath);
  assert.equal(secondRepository.getPDWin11State('check-pd')?.state, 'on');
  assert.equal(
    secondRepository.getPDWin11State('check-pd')?.detectedStartAt,
    '2026-03-13T08:10:00.000Z',
  );
  secondRepository.close();
});

test('checkPDWin11 treats prlctl stopped state as off', async () => {
  const store = new MemoryPDWin11StateStore();
  const tool = createCheckPDWin11Tool({
    now: () => new Date('2026-03-13T08:10:00.000Z'),
    inspectVm: async () => ({
      id: 'vm-1',
      name: 'Windows 11',
      rawState: 'stopped',
      state: 'off',
    }),
  });

  const result = await tool.execute({
    runId: 'run_6',
    botId: 'ops',
    signal: new AbortController().signal,
    actorId: 'local-admin',
    task: {
      id: 'check-pd',
      runnerKind: 'builtin-tool',
      executionMode: 'cronjob',
      description: 'Check Windows 11 VM',
      tool: 'checkPDWin11',
      timeoutMs: 5000,
      cancellable: false,
      parameters: {},
      cron: {
        schedule: '*/5 * * * *',
        autoStart: true,
      },
      config: {
        vm_name_match: 'Windows 11',
      },
    },
    parameters: {},
    pdWin11StateStore: store,
  });

  assert.equal(result.summary, 'Windows 11 is off');
  assert.equal(store.getPDWin11State('check-pd')?.state, 'off');
});
