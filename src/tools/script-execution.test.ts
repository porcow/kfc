import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from '../test-compat.ts';

import { createOsascriptScriptTool, createShellScriptTool } from './script-execution.ts';

test('shell script tool materializes and executes the submitted script body', async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'kids-alfred-shell-tool-'));
  let executedScriptPath: string | undefined;
  const tool = createShellScriptTool({
    runScript: async (scriptPath) => {
      executedScriptPath = scriptPath;
      const contents = await readFile(scriptPath, 'utf8');
      assert.equal(contents, 'echo "Hello from shell"');
      return {
        summary: 'shell complete',
        stdout: 'Hello from shell',
      };
    },
  });

  const result = await tool.execute({
    runId: 'run-shell-1',
    signal: new AbortController().signal,
    task: {
      id: 'shell',
      runnerKind: 'builtin-tool',
      executionMode: 'oneshot',
      description: 'Execute shell',
      tool: 'shell-script',
      timeoutMs: 30000,
      cancellable: false,
      parameters: {},
      config: {
        working_directory: workingDirectory,
      },
    },
    actorId: 'operator-1',
    parameters: {
      script: 'echo "Hello from shell"',
    },
  });

  assert.equal(result.summary, 'shell complete');
  assert.ok(executedScriptPath);
  await assert.rejects(() => access(executedScriptPath!), /ENOENT/u);
});

test('osascript tool materializes and executes the submitted script body', async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'kids-alfred-osascript-tool-'));
  let executedScriptPath: string | undefined;
  const tool = createOsascriptScriptTool({
    runScript: async (scriptPath) => {
      executedScriptPath = scriptPath;
      const contents = await readFile(scriptPath, 'utf8');
      assert.equal(contents, 'display notification "Hello World" with title "Test"');
      return {
        summary: 'osascript complete',
      };
    },
  });

  const result = await tool.execute({
    runId: 'run-osascript-1',
    signal: new AbortController().signal,
    task: {
      id: 'osascript',
      runnerKind: 'builtin-tool',
      executionMode: 'oneshot',
      description: 'Execute AppleScript',
      tool: 'osascript-script',
      timeoutMs: 30000,
      cancellable: false,
      parameters: {},
      config: {
        working_directory: workingDirectory,
      },
    },
    actorId: 'operator-1',
    parameters: {
      script: 'display notification "Hello World" with title "Test"',
    },
  });

  assert.equal(result.summary, 'osascript complete');
  assert.ok(executedScriptPath);
  await assert.rejects(() => access(executedScriptPath!), /ENOENT/u);
});

test('script tools fail clearly when script content is missing', async () => {
  const shellTool = createShellScriptTool();
  const osascriptTool = createOsascriptScriptTool();

  await assert.rejects(
    () =>
      shellTool.execute({
        runId: 'run-shell-2',
        signal: new AbortController().signal,
        task: {
          id: 'shell',
          runnerKind: 'builtin-tool',
          executionMode: 'oneshot',
          description: 'Execute shell',
          tool: 'shell-script',
          timeoutMs: 30000,
          cancellable: false,
          parameters: {},
        },
        actorId: 'operator-1',
        parameters: {},
      }),
    /script content is required/u,
  );

  await assert.rejects(
    () =>
      osascriptTool.execute({
        runId: 'run-osascript-2',
        signal: new AbortController().signal,
        task: {
          id: 'osascript',
          runnerKind: 'builtin-tool',
          executionMode: 'oneshot',
          description: 'Execute osascript',
          tool: 'osascript-script',
          timeoutMs: 30000,
          cancellable: false,
          parameters: {},
        },
        actorId: 'operator-1',
        parameters: {},
      }),
    /script content is required/u,
  );
});
