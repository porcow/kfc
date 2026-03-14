import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PDWin11MonitorStateStore } from '../domain.ts';
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
    listProcesses: async () => {
      invocation += 1;
      if (invocation === 1 || invocation === 2) {
        return [
          {
            command:
              '/Users/porco/Parallels/Windows 11.pvm/Windows 11.app/Contents/MacOS/WinAppHelper --ivmid 0',
            startedAt: '2026-03-13T07:58:00.000Z',
          },
          {
            command:
              '/Applications/Parallels Desktop.app/Contents/MacOS//Parallels VM.app/Contents/MacOS/prl_vm_app --vm-name Windows 11 --uuid {52090892-4313-46a7-a87a-995cde047c11}',
            startedAt: '2026-03-13T08:00:00.000Z',
          },
        ];
      }
      return [];
    },
  });

  const startup = await tool.execute({
    runId: 'run_1',
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

  assert.equal(startup.notifications?.length, 1);
  assert.equal(startup.notifications?.[0].chatId, undefined);
  assert.match(startup.notifications?.[0].body ?? '', /Windows 11 start time/u);
  assert.equal(store.getPDWin11State('check-pd')?.state, 'on');

  const steady = await tool.execute({
    runId: 'run_2',
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

  assert.equal(steady.notifications?.length ?? 0, 0);

  const shutdown = await tool.execute({
    runId: 'run_3',
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

  assert.equal(shutdown.notifications?.length, 1);
  assert.match(shutdown.notifications?.[0].body ?? '', /Windows 11 shutdown time/u);
  assert.equal(store.getPDWin11State('check-pd')?.state, 'off');
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
    listProcesses: async () => [
      {
        command:
          '/Applications/Parallels Desktop.app/Contents/MacOS//Parallels VM.app/Contents/MacOS/prl_vm_app --vm-name Windows 11 --uuid {52090892-4313-46a7-a87a-995cde047c11}',
        startedAt: startTime,
      },
    ],
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
  assert.match(firstReminder.notifications?.[0].body ?? '', /2026\/03\/13 16:00:00/u);
  assert.equal(store.getPDWin11State('check-pd')?.lastRuntimeReminderAt, '2026-03-13T09:00:00.000Z');

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
  assert.equal(store.getPDWin11State('check-pd')?.lastRuntimeReminderAt, '2026-03-13T09:10:00.000Z');
});

test('checkPDWin11 leaves state unchanged when matching process start time cannot be parsed', async () => {
  const store = new MemoryPDWin11StateStore();
  store.savePDWin11State('check-pd', {
    state: 'off',
    lastTransitionAt: '2026-03-13T07:00:00.000Z',
  });
  const tool = createCheckPDWin11Tool({
    now: () => new Date('2026-03-13T08:10:00.000Z'),
    listProcesses: async () => [
      {
        command:
          '/Applications/Parallels Desktop.app/Contents/MacOS//Parallels VM.app/Contents/MacOS/prl_vm_app --vm-name Windows 11 --uuid {52090892-4313-46a7-a87a-995cde047c11}',
      },
    ],
  });

  await assert.rejects(() =>
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
  /start time/u);

  assert.equal(store.getPDWin11State('check-pd')?.state, 'off');
});

test('checkPDWin11 state persists across repository reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kids-alfred-pd-state-'));
  const databasePath = join(directory, 'ops.sqlite');
  const tool = createCheckPDWin11Tool({
    now: () => new Date('2026-03-13T08:10:00.000Z'),
    listProcesses: async () => [
      {
        command:
          '/Applications/Parallels Desktop.app/Contents/MacOS//Parallels VM.app/Contents/MacOS/prl_vm_app --vm-name Windows 11 --uuid {52090892-4313-46a7-a87a-995cde047c11}',
        startedAt: '2026-03-13T08:00:00.000Z',
      },
    ],
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
    '2026-03-13T08:00:00.000Z',
  );
  secondRepository.close();
});

test('checkPDWin11 ignores non-vm Parallels helper processes', async () => {
  const store = new MemoryPDWin11StateStore();
  const tool = createCheckPDWin11Tool({
    now: () => new Date('2026-03-13T08:10:00.000Z'),
    listProcesses: async () => [
      {
        command:
          '/Users/porco/Parallels/Windows 11.pvm/Windows 11.app/Contents/MacOS/WinAppHelper --ivmid 0',
        startedAt: '2026-03-13T08:00:00.000Z',
      },
      {
        command:
          '/Users/porco/Parallels/Windows 11.pvm/Windows 11.app/Contents/MacOS/WinAppHelper --fakestub --ivmid 0',
        startedAt: '2026-03-13T08:00:01.000Z',
      },
    ],
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
  assert.equal(result.notifications?.length ?? 0, 0);
  assert.equal(store.getPDWin11State('check-pd')?.state, 'off');
});
