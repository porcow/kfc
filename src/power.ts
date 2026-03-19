import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export type PowerEventType = 'sleep' | 'wake';

export interface PowerEvent {
  type: PowerEventType;
  observedAt: string;
  rawLine: string;
}

export interface PowerEventObserver {
  start(): void;
  close(): Promise<void>;
}

export interface PowerEventObserverHandlers {
  onSleep(event: PowerEvent): void | Promise<void>;
  onWake(event: PowerEvent): void | Promise<void>;
}

interface SpawnLike {
  (
    command: string,
    args: readonly string[],
    options?: { stdio?: string[] | 'pipe' },
  ): ChildProcessWithoutNullStreams;
}

export function parsePowerManagementTimestamp(raw: string): string | undefined {
  const match = raw.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
  );
  if (!match) {
    return undefined;
  }
  const [, datePart, timePart, offsetHour, offsetMinute] = match;
  const value = new Date(`${datePart}T${timePart}${offsetHour}:${offsetMinute}`);
  if (Number.isNaN(value.valueOf())) {
    return undefined;
  }
  return value.toISOString();
}

export function parsePowerManagementLogLine(
  line: string,
  now: string = new Date().toISOString(),
): PowerEvent | undefined {
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}) /);
  const observedAt =
    (timestampMatch ? parsePowerManagementTimestamp(timestampMatch[1]) : undefined) ?? now;

  if (/\bSleep\b/u.test(line) && line.includes('Entering Sleep state')) {
    return {
      type: 'sleep',
      observedAt,
      rawLine: line,
    };
  }

  if (/\bWake\b/u.test(line) && !line.includes('Wake Requests')) {
    return {
      type: 'wake',
      observedAt,
      rawLine: line,
    };
  }

  return undefined;
}

export function createMacOsPowerEventObserver(
  handlers: PowerEventObserverHandlers,
  options: {
    platform?: NodeJS.Platform;
    spawnImpl?: SpawnLike;
    now?: () => string;
  } = {},
): PowerEventObserver {
  const platform = options.platform ?? process.platform;
  const spawnImpl = options.spawnImpl ?? spawn;
  const now = options.now ?? (() => new Date().toISOString());
  let child: ChildProcessWithoutNullStreams | undefined;
  let lineReader: ReturnType<typeof createInterface> | undefined;

  const emitEvent = (event: PowerEvent) => {
    const handler = event.type === 'sleep' ? handlers.onSleep : handlers.onWake;
    Promise.resolve(handler(event)).catch((error) => {
      console.error(
        JSON.stringify({
          logType: 'power_event_handler_failed',
          eventType: event.type,
          observedAt: event.observedAt,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  };

  return {
    start() {
      if (platform !== 'darwin' || child) {
        return;
      }
      child = spawnImpl(
        '/usr/bin/log',
        ['stream', '--style', 'compact', '--predicate', 'process == "powerd"'],
        {
        stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      lineReader = createInterface({
        input: child.stdout,
      });
      lineReader.on('line', (line) => {
        const event = parsePowerManagementLogLine(line, now());
        if (!event) {
          return;
        }
        emitEvent(event);
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        console.error(
          JSON.stringify({
            logType: 'power_event_observer_stderr',
            error: String(chunk).trim(),
          }),
        );
      });
      child.on('exit', (code, signal) => {
        if (code === 0 || signal === 'SIGTERM') {
          return;
        }
        console.error(
          JSON.stringify({
            logType: 'power_event_observer_exited',
            code,
            signal,
          }),
        );
      });
    },
    async close() {
      lineReader?.close();
      lineReader = undefined;
      if (!child) {
        return;
      }
      const processToStop = child;
      child = undefined;
      processToStop.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        processToStop.once('exit', () => resolve());
      });
    },
  };
}
