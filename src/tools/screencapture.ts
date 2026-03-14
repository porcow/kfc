import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { TaskResult, TaskTool } from '../domain.ts';
import { defaultBotWorkingDirectory } from '../config/paths.ts';

const execFileAsync = promisify(execFile);

interface ScreencaptureToolOptions {
  now?: () => Date;
  capture?: (outputPath: string) => Promise<void>;
  ensureDirectory?: (path: string) => Promise<void>;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatFilenameTimestamp(now: Date): string {
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('') + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function captureScreen(outputPath: string): Promise<void> {
  await execFileAsync('screencapture', ['-x', outputPath]);
}

export function createScreencaptureTool(options: ScreencaptureToolOptions = {}): TaskTool {
  const now = options.now ?? (() => new Date());
  const capture = options.capture ?? captureScreen;
  const ensureDirectory = options.ensureDirectory ?? (async (path: string) => {
    await mkdir(path, { recursive: true });
  });

  return {
    id: 'screencapture',
    async execute(): Promise<TaskResult> {
      const timestamp = formatFilenameTimestamp(now());
      const dataDirectory = join(defaultBotWorkingDirectory(), 'data');
      await ensureDirectory(dataDirectory);
      const outputPath = join(dataDirectory, `screenshot-${timestamp}.png`);

      try {
        await capture(outputPath);
      } catch (error) {
        throw new Error(
          `Failed to capture the current screen: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return {
        summary: `Screen captured to ${outputPath}`,
        data: {
          screenshotPath: outputPath,
        },
        artifacts: [
          {
            channel: 'feishu',
            kind: 'origin-chat-image',
            path: outputPath,
            deleteAfterDelivery: true,
          },
        ],
      };
    },
  };
}
