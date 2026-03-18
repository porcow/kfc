import type { TaskResult, TaskTool } from '../domain.ts';
import type { UpdateExecutionResult, UpdateInspection } from '../update.ts';
import { inspectUpdateState } from '../update.ts';
import { prepareSelfUpdateHandoff } from '../service-refresh.ts';

interface SelfUpdateToolOptions {
  inspect?: () => Promise<UpdateInspection>;
  perform?: (
    inspection: Extract<UpdateInspection, { status: 'update_available' }>,
    context: Parameters<TaskTool['execute']>[0],
  ) => Promise<UpdateExecutionResult>;
}

export function createSelfUpdateTool(options: SelfUpdateToolOptions = {}): TaskTool {
  const inspect = options.inspect ?? inspectUpdateState;
  const perform =
    options.perform ??
    (async (inspection, context) => {
      const result = await prepareSelfUpdateHandoff(inspection, {
        botId: context.botId,
        runId: context.runId,
      });
      return {
        previousVersion: inspection.currentVersion,
        currentVersion: inspection.latestVersion,
        summary: result.summary,
      };
    });

  return {
    id: 'self-update',
    async execute(context): Promise<TaskResult> {
      const inspection = await inspect();
      if (inspection.status === 'blocked') {
        throw new Error(inspection.summary);
      }
      if (inspection.status === 'up_to_date') {
        return {
          summary: inspection.summary,
          data: {
            currentVersion: inspection.currentVersion,
            latestVersion: inspection.latestVersion,
          },
        };
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
