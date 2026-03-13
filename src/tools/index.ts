import type { TaskTool } from '../domain.ts';
import { echoTool } from './echo.ts';

export function createBuiltinToolRegistry(): Map<string, TaskTool> {
  return new Map<string, TaskTool>([[echoTool.id, echoTool]]);
}
