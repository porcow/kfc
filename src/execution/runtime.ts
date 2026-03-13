import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import type {
  RunRecord,
  RunUpdateSink,
  TaskDefinition,
  TaskResult,
  TaskTool,
} from '../domain.ts';
import { RunRepository } from '../persistence/run-repository.ts';

interface ActiveExecution {
  abortController: AbortController;
  cancellable: boolean;
}

function fillTemplate(template: string, parameters: Record<string, string | number | boolean>): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) =>
    name in parameters ? String(parameters[name]) : '',
  );
}

async function runExternalCommand(
  task: Extract<TaskDefinition, { runnerKind: 'external-command' }>,
  parameters: Record<string, string | number | boolean>,
  signal: AbortSignal,
): Promise<TaskResult> {
  return await new Promise<TaskResult>((resolve, reject) => {
    const args = task.args.map((arg) => fillTemplate(arg, parameters));
    const child = spawn(fillTemplate(task.command, parameters), args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, task.timeoutMs);

    signal.addEventListener(
      'abort',
      () => {
        cancelled = true;
        child.kill('SIGTERM');
      },
      { once: true },
    );

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error('TASK_TIMEOUT'));
        return;
      }
      if (cancelled) {
        reject(new Error('TASK_CANCELLED'));
        return;
      }
      if (code === 0) {
        resolve({
          summary: stdout.trim() || `Command ${task.command} completed successfully`,
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          exitCode: code ?? 0,
        });
        return;
      }
      reject(
        Object.assign(new Error(stderr.trim() || `Command exited with code ${code}`), {
          exitCode: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        }),
      );
    });
  });
}

async function runBuiltinToolViaKfc(
  task: Extract<TaskDefinition, { runnerKind: 'builtin-tool' }>,
  run: RunRecord,
  signal: AbortSignal,
): Promise<TaskResult> {
  return await new Promise<TaskResult>((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        resolve(process.cwd(), 'src/kfc.ts'),
        'exec',
        '--task-json',
        Buffer.from(JSON.stringify(task), 'utf8').toString('base64'),
        '--parameters-json',
        Buffer.from(JSON.stringify(run.parameters), 'utf8').toString('base64'),
        '--actor',
        run.actorId,
        '--run-id',
        run.runId,
      ],
      {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, task.timeoutMs);

    signal.addEventListener(
      'abort',
      () => {
        cancelled = true;
        child.kill('SIGTERM');
      },
      { once: true },
    );

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        rejectPromise(new Error('TASK_TIMEOUT'));
        return;
      }
      if (cancelled) {
        rejectPromise(new Error('TASK_CANCELLED'));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(stderr.trim() || `Builtin tool exited with code ${code}`));
        return;
      }

      try {
        resolvePromise(JSON.parse(stdout.trim()) as TaskResult);
      } catch {
        resolvePromise({
          summary: stdout.trim() || `Builtin tool ${task.tool} completed successfully`,
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          exitCode: 0,
        });
      }
    });
  });
}

export class TaskRuntime {
  private readonly activeExecutions = new Map<string, ActiveExecution>();
  private readonly activePromises = new Set<Promise<void>>();
  private readonly repository: RunRepository;
  private readonly tools: Map<string, TaskTool>;
  private readonly updates: RunUpdateSink;

  constructor(repository: RunRepository, tools: Map<string, TaskTool>, updates: RunUpdateSink) {
    this.repository = repository;
    this.tools = tools;
    this.updates = updates;
  }

  async start(run: RunRecord, task: TaskDefinition): Promise<void> {
    const taskPromise = this.run(run, task);
    this.activePromises.add(taskPromise);
    try {
      await taskPromise;
    } finally {
      this.activePromises.delete(taskPromise);
    }
  }

  async waitForIdle(): Promise<void> {
    if (this.activePromises.size === 0) {
      return;
    }
    await Promise.allSettled([...this.activePromises]);
  }

  private async run(run: RunRecord, task: TaskDefinition): Promise<void> {
    const abortController = new AbortController();
    this.activeExecutions.set(run.runId, {
      abortController,
      cancellable: run.cancellable,
    });

    const runningRun = this.repository.updateRun(run.runId, {
      state: 'running',
      startedAt: new Date().toISOString(),
      statusSummary: 'Task started',
    });
    await this.updates.sendRunUpdate(runningRun);

    try {
      const result =
        task.runnerKind === 'builtin-tool'
          ? await runBuiltinToolViaKfc(task, run, abortController.signal)
          : await runExternalCommand(task, run.parameters, abortController.signal);

      const completed = this.repository.updateRun(run.runId, {
        state: 'succeeded',
        finishedAt: new Date().toISOString(),
        statusSummary: result.summary,
        resultJson: JSON.stringify(result),
      });
      await this.updates.sendRunUpdate(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalState =
        message === 'TASK_TIMEOUT'
          ? 'timed_out'
          : message === 'TASK_CANCELLED'
            ? 'cancelled'
            : 'failed';
      const failed = this.repository.updateRun(run.runId, {
        state: finalState,
        finishedAt: new Date().toISOString(),
        statusSummary:
          finalState === 'timed_out'
            ? 'Task timed out'
            : finalState === 'cancelled'
              ? 'Task cancelled'
              : message,
        resultJson: JSON.stringify({
          error: message,
        }),
      });
      await this.updates.sendRunUpdate(failed);
    } finally {
      this.activeExecutions.delete(run.runId);
    }
  }

  cancel(runId: string): boolean {
    const active = this.activeExecutions.get(runId);
    if (!active || !active.cancellable) {
      return false;
    }
    active.abortController.abort();
    return true;
  }
}
