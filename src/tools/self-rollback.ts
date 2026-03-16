import type { TaskResult, TaskTool } from '../domain.ts';
import type { RollbackExecutionResult, RollbackInspection } from '../update.ts';
import { inspectRollbackState, performRollback } from '../update.ts';

interface SelfRollbackToolOptions {
  inspect?: () => Promise<RollbackInspection>;
  perform?: (
    inspection: Extract<RollbackInspection, { status: 'rollback_available' }>,
  ) => Promise<RollbackExecutionResult>;
}

export function createSelfRollbackTool(options: SelfRollbackToolOptions = {}): TaskTool {
  const inspect = options.inspect ?? inspectRollbackState;
  const perform = options.perform ?? performRollback;

  return {
    id: 'self-rollback',
    async execute(): Promise<TaskResult> {
      const inspection = await inspect();
      if (inspection.status === 'blocked') {
        throw new Error(inspection.summary);
      }

      const result = await perform(inspection);
      return {
        summary: result.summary,
        data: {
          previousVersion: result.previousVersion,
          currentVersion: result.currentVersion,
        },
      };
    },
  };
}
