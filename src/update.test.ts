import assert from 'node:assert/strict';
import test from 'node:test';

import type { UpdateExecutionResult } from './update.ts';
import { inspectUpdateState, performSelfUpdate } from './update.ts';

type ExecCall = { file: string; args: readonly string[]; cwd?: string };

function createExecStub(
  handlers: Array<(call: ExecCall) => { stdout: string; stderr: string } | Promise<{ stdout: string; stderr: string }>>,
): {
  calls: ExecCall[];
  execFileAsync: (
    file: string,
    args: readonly string[],
    options?: { cwd?: string },
  ) => Promise<{ stdout: string; stderr: string }>;
} {
  const calls: ExecCall[] = [];
  return {
    calls,
    execFileAsync: async (file, args, options) => {
      calls.push({ file, args, cwd: options?.cwd });
      const handler = handlers.shift();
      if (!handler) {
        throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
      }
      return await handler({ file, args, cwd: options?.cwd });
    },
  };
}

test('inspectUpdateState returns up_to_date when HEAD matches upstream', async () => {
  const exec = createExecStub([
    () => ({ stdout: 'true\n', stderr: '' }),
    () => ({ stdout: '', stderr: '' }),
    () => ({ stdout: 'main\n', stderr: '' }),
    () => ({ stdout: 'abc1234\n', stderr: '' }),
    () => ({ stdout: 'origin/main\n', stderr: '' }),
    () => ({ stdout: '', stderr: '' }),
    () => ({ stdout: 'abc1234\n', stderr: '' }),
    () => ({ stdout: '0\t0\n', stderr: '' }),
  ]);

  const result = await inspectUpdateState({
    cwd: '/repo',
    execFileAsync: exec.execFileAsync,
  });

  assert.equal(result.status, 'up_to_date');
  assert.equal(result.currentVersion.commit, 'abc1234');
  assert.equal(result.latestVersion.commit, 'abc1234');
  assert.match(result.summary, /Already up to date/);
});

test('inspectUpdateState reports update_available only for fast-forward updates', async () => {
  const exec = createExecStub([
    () => ({ stdout: 'true\n', stderr: '' }),
    () => ({ stdout: '', stderr: '' }),
    () => ({ stdout: 'main\n', stderr: '' }),
    () => ({ stdout: 'abc1234\n', stderr: '' }),
    () => ({ stdout: 'origin/main\n', stderr: '' }),
    () => ({ stdout: '', stderr: '' }),
    () => ({ stdout: 'def5678\n', stderr: '' }),
    () => ({ stdout: '0\t3\n', stderr: '' }),
  ]);

  const result = await inspectUpdateState({
    cwd: '/repo',
    execFileAsync: exec.execFileAsync,
  });

  assert.equal(result.status, 'update_available');
  assert.equal(result.currentVersion.commit, 'abc1234');
  assert.equal(result.latestVersion.commit, 'def5678');
});

test('inspectUpdateState blocks dirty working trees, missing upstream, ahead, and diverged states', async (t) => {
  await t.test('dirty working tree', async () => {
    const exec = createExecStub([
      () => ({ stdout: 'true\n', stderr: '' }),
      () => ({ stdout: ' M src/index.ts\n', stderr: '' }),
    ]);
    const result = await inspectUpdateState({ cwd: '/repo', execFileAsync: exec.execFileAsync });
    assert.deepEqual(result, {
      status: 'blocked',
      summary: 'Update blocked: working tree has uncommitted changes.',
    });
  });

  await t.test('missing upstream', async () => {
    const exec = createExecStub([
      () => ({ stdout: 'true\n', stderr: '' }),
      () => ({ stdout: '', stderr: '' }),
      () => ({ stdout: 'main\n', stderr: '' }),
      () => ({ stdout: 'abc1234\n', stderr: '' }),
      async () => {
        throw new Error('fatal: no upstream configured');
      },
    ]);
    const result = await inspectUpdateState({ cwd: '/repo', execFileAsync: exec.execFileAsync });
    assert.deepEqual(result, {
      status: 'blocked',
      summary: 'Update blocked: no upstream tracking branch is configured.',
    });
  });

  await t.test('local ahead', async () => {
    const exec = createExecStub([
      () => ({ stdout: 'true\n', stderr: '' }),
      () => ({ stdout: '', stderr: '' }),
      () => ({ stdout: 'main\n', stderr: '' }),
      () => ({ stdout: 'abc1234\n', stderr: '' }),
      () => ({ stdout: 'origin/main\n', stderr: '' }),
      () => ({ stdout: '', stderr: '' }),
      () => ({ stdout: 'abc1234\n', stderr: '' }),
      () => ({ stdout: '2\t0\n', stderr: '' }),
    ]);
    const result = await inspectUpdateState({ cwd: '/repo', execFileAsync: exec.execFileAsync });
    assert.deepEqual(result, {
      status: 'blocked',
      summary: 'Update blocked: local branch is ahead of upstream.',
    });
  });

  await t.test('diverged', async () => {
    const exec = createExecStub([
      () => ({ stdout: 'true\n', stderr: '' }),
      () => ({ stdout: '', stderr: '' }),
      () => ({ stdout: 'main\n', stderr: '' }),
      () => ({ stdout: 'abc1234\n', stderr: '' }),
      () => ({ stdout: 'origin/main\n', stderr: '' }),
      () => ({ stdout: '', stderr: '' }),
      () => ({ stdout: 'def5678\n', stderr: '' }),
      () => ({ stdout: '1\t3\n', stderr: '' }),
    ]);
    const result = await inspectUpdateState({ cwd: '/repo', execFileAsync: exec.execFileAsync });
    assert.deepEqual(result, {
      status: 'blocked',
      summary: 'Update blocked: local branch has diverged from upstream.',
    });
  });
});

test('performSelfUpdate pulls, installs dependencies, refreshes service, and reports final version', async () => {
  const exec = createExecStub([
    () => ({ stdout: '', stderr: '' }),
    () => ({ stdout: 'main\n', stderr: '' }),
    () => ({ stdout: 'def5678\n', stderr: '' }),
  ]);
  const installCalls: string[] = [];
  const serviceInstallCalls: string[] = [];

  const result = await performSelfUpdate(
    {
      status: 'update_available',
      currentVersion: {
        branch: 'main',
        commit: 'abc1234',
        upstreamBranch: 'origin/main',
      },
      latestVersion: {
        branch: 'main',
        commit: 'def5678',
        upstreamBranch: 'origin/main',
      },
      summary: 'Update available',
    },
    {
      cwd: '/repo',
      execFileAsync: exec.execFileAsync,
      configPath: '/config.toml',
      installDependencies: async (cwd) => {
        installCalls.push(cwd);
      },
      serviceInstaller: async (configPath) => {
        serviceInstallCalls.push(configPath);
      },
    },
  );

  assert.deepEqual(installCalls, ['/repo']);
  assert.deepEqual(serviceInstallCalls, ['/config.toml']);
  assert.deepEqual(exec.calls.map((call) => `${call.file} ${call.args.join(' ')}`), [
    'git pull --ff-only',
    'git rev-parse --abbrev-ref HEAD',
    'git rev-parse --short HEAD',
  ]);
  assert.deepEqual(result, {
    previousVersion: {
      branch: 'main',
      commit: 'abc1234',
      upstreamBranch: 'origin/main',
    },
    currentVersion: {
      branch: 'main',
      commit: 'def5678',
      upstreamBranch: 'origin/main',
    },
    summary: 'Update complete: main@abc1234 -> main@def5678.',
  } satisfies UpdateExecutionResult);
});
