import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createScreencaptureTool } from './screencapture.ts';

test('screencapture writes a png file and returns a Feishu image artifact', async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), 'kids-alfred-sc-home-'));
  const previousHome = process.env.HOME;
  process.env.HOME = homeDirectory;

  try {
    const tool = createScreencaptureTool({
      now: () => new Date('2026-03-15T09:10:11.000Z'),
      capture: async (outputPath) => {
        await writeFile(outputPath, 'png-data');
      },
    });

    const result = await tool.execute({
      runId: 'run_sc_1',
      signal: new AbortController().signal,
      task: {
        id: 'sc',
        runnerKind: 'builtin-tool',
        executionMode: 'oneshot',
        description: 'Capture screen',
        tool: 'screencapture',
        timeoutMs: 30000,
        cancellable: false,
        parameters: {},
      },
      actorId: 'operator-1',
      parameters: {},
    });

    const screenshotPath = String(result.data?.screenshotPath);
    assert.match(screenshotPath, /\/\.kfc\/data\/screenshot-\d{8}-\d{6}\.png$/u);
    assert.equal(await readFile(screenshotPath, 'utf8'), 'png-data');
    assert.equal(result.artifacts?.length, 1);
    assert.equal(result.artifacts?.[0].kind, 'origin-chat-image');
    assert.equal(result.artifacts?.[0].path, screenshotPath);
    assert.equal(result.artifacts?.[0].deleteAfterDelivery, true);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test('screencapture surfaces clear capture failures', async () => {
  const tool = createScreencaptureTool({
    ensureDirectory: async () => {},
    capture: async () => {
      throw new Error('screen recording permission denied');
    },
  });

  await assert.rejects(
    () =>
      tool.execute({
        runId: 'run_sc_2',
        signal: new AbortController().signal,
        task: {
          id: 'sc',
          runnerKind: 'builtin-tool',
          executionMode: 'oneshot',
          description: 'Capture screen',
          tool: 'screencapture',
          timeoutMs: 30000,
          cancellable: false,
          parameters: {},
        },
        actorId: 'operator-1',
        parameters: {},
      }),
    /Failed to capture the current screen: screen recording permission denied/u,
  );
});
