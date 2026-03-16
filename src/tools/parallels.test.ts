import { test } from '../test-compat.ts';
import assert from 'node:assert/strict';

import { createPrlctlParallelsVmClient } from './parallels.ts';

test('prlctl client normalizes a running VM and derives detected start time from uptime', async () => {
  const client = createPrlctlParallelsVmClient({
    now: () => new Date('2026-03-15T08:00:00.000Z'),
    runPrlctl: async () => ({
      stdout: JSON.stringify([
        {
          ID: 'vm-1',
          Name: 'Windows 11',
          State: 'running',
          Uptime: '120',
        },
      ]),
      stderr: '',
    }),
  });

  const inspection = await client.inspectVmByName('Windows 11');
  assert.deepEqual(inspection, {
    id: 'vm-1',
    name: 'Windows 11',
    rawState: 'running',
    state: 'on',
    detectedStartAt: '2026-03-15T07:58:00.000Z',
  });
});

test('prlctl client normalizes stopped and suspended VMs as off', async () => {
  const stoppedClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => ({
      stdout: JSON.stringify([{ ID: 'vm-1', Name: 'Windows 11', State: 'stopped' }]),
      stderr: '',
    }),
  });
  const suspendedClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => ({
      stdout: JSON.stringify([{ ID: 'vm-1', Name: 'Windows 11', State: 'suspended' }]),
      stderr: '',
    }),
  });

  assert.equal((await stoppedClient.inspectVmByName('Windows 11')).state, 'off');
  assert.equal((await suspendedClient.inspectVmByName('Windows 11')).state, 'off');
});

test('prlctl client rejects transitional and unsupported VM states', async () => {
  const transitionalClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => ({
      stdout: JSON.stringify([{ ID: 'vm-1', Name: 'Windows 11', State: 'starting' }]),
      stderr: '',
    }),
  });
  const unsupportedClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => ({
      stdout: JSON.stringify([{ ID: 'vm-1', Name: 'Windows 11', State: 'migrating' }]),
      stderr: '',
    }),
  });

  await assert.rejects(
    () => transitionalClient.inspectVmByName('Windows 11'),
    /transitional state/u,
  );
  await assert.rejects(
    () => unsupportedClient.inspectVmByName('Windows 11'),
    /Unsupported Parallels VM state/u,
  );
});

test('prlctl client surfaces missing VM, invalid JSON, and missing prlctl clearly', async () => {
  const missingVmClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => ({ stdout: '[]', stderr: '' }),
  });
  const invalidJsonClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => ({ stdout: '{', stderr: '' }),
  });
  const missingPrlctlClient = createPrlctlParallelsVmClient({
    runPrlctl: async () => {
      const error = new Error('spawn prlctl ENOENT') as Error & { code?: string };
      error.code = 'ENOENT';
      throw error;
    },
  });

  await assert.rejects(
    () => missingVmClient.inspectVmByName('Windows 11'),
    /Parallels VM not found/u,
  );
  await assert.rejects(
    () => invalidJsonClient.inspectVmByName('Windows 11'),
    /Unable to parse prlctl JSON/u,
  );
  await assert.rejects(
    () => missingPrlctlClient.inspectVmByName('Windows 11'),
    /Parallels CLI prlctl is not available/u,
  );
});
