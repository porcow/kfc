import type { TaskTool } from '../domain.ts';
import { createCheckPDWin11Tool } from './checkPDWin11.ts';
import { echoTool } from './echo.ts';

export function createBuiltinToolRegistry(): Map<string, TaskTool> {
  return new Map<string, TaskTool>([
    [echoTool.id, echoTool],
    ['checkPDWin11', createCheckPDWin11Tool()],
  ]);
}
