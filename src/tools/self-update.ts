import type { TaskResult, TaskTool } from '../domain.ts';
import type { UpdateExecutionResult, UpdateInspection } from '../update.ts';
import { performSelfUpdate, inspectUpdateState } from '../update.ts';

interface SelfUpdateToolOptions {
  inspect?: () => Promise<UpdateInspection>;
  perform?: (
    inspection: Extract<UpdateInspection, { status: 'update_available' }>,
  ) => Promise<UpdateExecutionResult>;
}

export function createSelfUpdateTool(options: SelfUpdateToolOptions = {}): TaskTool {
  const inspect = options.inspect ?? inspectUpdateState;
  const perform = options.perform ?? performSelfUpdate;

  return {
    id: 'self-update',
    async execute(): Promise<TaskResult> {
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
