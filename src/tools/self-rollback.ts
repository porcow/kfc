import type { TaskResult, TaskTool } from '../domain.ts';
import type { RollbackExecutionResult, RollbackInspection } from '../update.ts';
import { inspectRollbackState } from '../update.ts';
import { prepareRollbackHandoff } from '../service-refresh.ts';

interface SelfRollbackToolOptions {
  inspect?: () => Promise<RollbackInspection>;
  perform?: (
    inspection: Extract<RollbackInspection, { status: 'rollback_available' }>,
    context: Parameters<TaskTool['execute']>[0],
  ) => Promise<RollbackExecutionResult>;
}

export function createSelfRollbackTool(options: SelfRollbackToolOptions = {}): TaskTool {
  const inspect = options.inspect ?? inspectRollbackState;
  const perform =
    options.perform ??
    (async (inspection, context) => {
      const result = await prepareRollbackHandoff(inspection, {
        botId: context.botId,
        runId: context.runId,
      });
      return {
        previousVersion: inspection.currentVersion,
        currentVersion: inspection.previousVersion,
        summary: result.summary,
      };
    });

  return {
    id: 'self-rollback',
    async execute(context): Promise<TaskResult> {
      const inspection = await inspect();
      if (inspection.status === 'blocked') {
        throw new Error(inspection.summary);
      }

      const result = await perform(inspection, context);
      return {
        summary: result.summary,
        data: {
          serviceRefreshHandoff: true,
          previousVersion: result.previousVersion,
          currentVersion: result.currentVersion,
        },
      };
    },
  };
}
