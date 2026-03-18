import type { TaskTool } from '../domain.ts';
import { createCheckPDWin11Tool } from './checkPDWin11.ts';
import { echoTool } from './echo.ts';
import { createOsascriptScriptTool, createShellScriptTool } from './script-execution.ts';
import { createSelfRollbackTool } from './self-rollback.ts';
import { createSelfUpdateTool } from './self-update.ts';
import { createScreencaptureTool } from './screencapture.ts';

export function createBuiltinToolRegistry(): Map<string, TaskTool> {
  return new Map<string, TaskTool>([
    [echoTool.id, echoTool],
    ['checkPDWin11', createCheckPDWin11Tool()],
    ['shell-script', createShellScriptTool()],
    ['osascript-script', createOsascriptScriptTool()],
    ['self-update', createSelfUpdateTool()],
    ['self-rollback', createSelfRollbackTool()],
    ['screencapture', createScreencaptureTool()],
  ]);
}
