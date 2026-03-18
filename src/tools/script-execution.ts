import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { TaskResult, TaskRunContext, TaskTool } from '../domain.ts';
import { defaultBotWorkingDirectory } from '../config/paths.ts';

const execFileAsync = promisify(execFile);

interface ScriptExecutionToolOptions {
  runScript?: (scriptPath: string, signal: AbortSignal) => Promise<TaskResult>;
  ensureDirectory?: (path: string) => Promise<void>;
  createTempDirectory?: (prefix: string) => Promise<string>;
  writeScriptFile?: (path: string, contents: string) => Promise<void>;
  removePath?: (path: string) => Promise<void>;
}

function resolveWorkingDirectory(context: TaskRunContext): string {
  const configuredDirectory =
    context.workingDirectory
    ?? (context.task.runnerKind === 'builtin-tool' ? context.task.config?.working_directory : undefined);
  return typeof configuredDirectory === 'string' && configuredDirectory.trim()
    ? configuredDirectory
    : defaultBotWorkingDirectory();
}

function requireScriptContent(context: TaskRunContext): string {
  const script = context.parameters.script;
  if (typeof script !== 'string' || !script.trim()) {
    throw new Error('script content is required');
  }
  return script;
}

function buildExecutionResult(stdout: string, stderr: string): TaskResult {
  return {
    summary: stdout.trim() || stderr.trim() || 'Script completed successfully',
    stdout: stdout.trim() || undefined,
    stderr: stderr.trim() || undefined,
    exitCode: 0,
  };
}

async function runShellScript(scriptPath: string, signal: AbortSignal): Promise<TaskResult> {
  const { stdout, stderr } = await execFileAsync('/bin/sh', [scriptPath], { signal });
  return buildExecutionResult(stdout, stderr);
}

async function runOsascript(scriptPath: string, signal: AbortSignal): Promise<TaskResult> {
  const { stdout, stderr } = await execFileAsync('/usr/bin/osascript', [scriptPath], { signal });
  return buildExecutionResult(stdout, stderr);
}

function createScriptExecutionTool(
  id: string,
  filename: string,
  executeScript: (scriptPath: string, signal: AbortSignal) => Promise<TaskResult>,
  options: ScriptExecutionToolOptions = {},
): TaskTool {
  const ensureDirectory = options.ensureDirectory ?? (async (path: string) => {
    await mkdir(path, { recursive: true });
  });
  const createTempDirectory = options.createTempDirectory ?? (async (prefix: string) => await mkdtemp(prefix));
  const writeScriptFile = options.writeScriptFile ?? (async (path: string, contents: string) => {
    await writeFile(path, contents, { mode: 0o700 });
  });
  const removePath = options.removePath ?? (async (path: string) => {
    await rm(path, { recursive: true, force: true });
  });
  const runScript = options.runScript ?? executeScript;

  return {
    id,
    async execute(context): Promise<TaskResult> {
      const script = requireScriptContent(context);
      const workingDirectory = resolveWorkingDirectory(context);
      const scratchRoot = join(workingDirectory, 'data');
      await ensureDirectory(scratchRoot);
      const temporaryDirectory = await createTempDirectory(join(scratchRoot, `${id}-`));
      const scriptPath = join(temporaryDirectory, filename);
      try {
        await writeScriptFile(scriptPath, script);
        return await runScript(scriptPath, context.signal);
      } catch (error) {
        throw new Error(
          `Failed to execute ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await removePath(temporaryDirectory).catch(() => undefined);
      }
    },
  };
}

export function createShellScriptTool(options: ScriptExecutionToolOptions = {}): TaskTool {
  return createScriptExecutionTool('shell-script', 'script.sh', runShellScript, options);
}

export function createOsascriptScriptTool(options: ScriptExecutionToolOptions = {}): TaskTool {
  return createScriptExecutionTool('osascript-script', 'script.applescript', runOsascript, options);
}
