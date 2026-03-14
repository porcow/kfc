import type { TaskTool } from '../domain.ts';
import { createCheckPDWin11Tool } from './checkPDWin11.ts';
import { echoTool } from './echo.ts';
import { createScreencaptureTool } from './screencapture.ts';

export function createBuiltinToolRegistry(): Map<string, TaskTool> {
  return new Map<string, TaskTool>([
    [echoTool.id, echoTool],
    ['checkPDWin11', createCheckPDWin11Tool()],
    ['screencapture', createScreencaptureTool()],
  ]);
}
