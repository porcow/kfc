import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PRLCTL_PATH = '/usr/local/bin/prlctl';

export type NormalizedParallelsVmState = 'on' | 'off';

export interface ParallelsVmInspection {
  id: string;
  name: string;
  rawState: string;
  state: NormalizedParallelsVmState;
  detectedStartAt?: string;
}

export interface ParallelsVmClient {
  inspectVmByName(name: string): Promise<ParallelsVmInspection>;
  executeVmAction(
    name: string,
    action: string,
    args?: string[],
  ): Promise<{ stdout: string; stderr: string }>;
}

interface PrlctlVmRecord {
  ID?: unknown;
  Name?: unknown;
  State?: unknown;
  Uptime?: unknown;
}

interface CreatePrlctlParallelsVmClientDeps {
  runPrlctl?: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  now?: () => Date;
}

async function runPrlctl(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(PRLCTL_PATH, args);
}

function getStringField(record: PrlctlVmRecord, key: 'ID' | 'Name' | 'State'): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Parallels CLI response is missing ${key}`);
  }
  return value;
}

function parseUptimeSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function normalizeVmRecord(record: PrlctlVmRecord, observedAt: Date): ParallelsVmInspection {
  const id = getStringField(record, 'ID');
  const name = getStringField(record, 'Name');
  const rawState = getStringField(record, 'State').trim().toLowerCase();
  const uptimeSeconds = parseUptimeSeconds(record.Uptime);

  if (rawState === 'running') {
    return {
      id,
      name,
      rawState,
      state: 'on',
      detectedStartAt:
        uptimeSeconds === undefined
          ? undefined
          : new Date(observedAt.valueOf() - uptimeSeconds * 1000).toISOString(),
    };
  }

  if (rawState === 'stopped' || rawState === 'suspended' || rawState === 'paused') {
    return {
      id,
      name,
      rawState,
      state: 'off',
    };
  }

  if (rawState === 'starting' || rawState === 'stopping' || rawState === 'resetting') {
    throw new Error(`Parallels VM ${name} is in transitional state: ${rawState}`);
  }

  throw new Error(`Unsupported Parallels VM state for ${name}: ${rawState}`);
}

function parseInspectionOutput(stdout: string, vmName: string, observedAt: Date): ParallelsVmInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Unable to parse prlctl JSON for ${vmName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Unexpected prlctl JSON shape for ${vmName}`);
  }
  const exactMatch = parsed.find(
    (entry): entry is PrlctlVmRecord =>
      !!entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      (entry as PrlctlVmRecord).Name === vmName,
  );
  if (!exactMatch) {
    throw new Error(`Parallels VM not found: ${vmName}`);
  }
  return normalizeVmRecord(exactMatch, observedAt);
}

function wrapPrlctlError(action: string, vmName: string, error: unknown): Error {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  ) {
    return new Error('Parallels CLI prlctl is not available on this host');
  }
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
    if (stderr) {
      return new Error(`prlctl ${action} failed for ${vmName}: ${stderr}`);
    }
  }
  return new Error(
    `prlctl ${action} failed for ${vmName}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export function createPrlctlParallelsVmClient(
  deps: CreatePrlctlParallelsVmClientDeps = {},
): ParallelsVmClient {
  const execPrlctl = deps.runPrlctl ?? runPrlctl;
  const now = deps.now ?? (() => new Date());

  return {
    async inspectVmByName(name: string): Promise<ParallelsVmInspection> {
      try {
        const { stdout } = await execPrlctl(['list', '--all', '--info', '--json', name]);
        return parseInspectionOutput(stdout, name, now());
      } catch (error) {
        throw wrapPrlctlError('inspect', name, error);
      }
    },
    async executeVmAction(name: string, action: string, args: string[] = []) {
      try {
        return await execPrlctl([action, name, ...args]);
      } catch (error) {
        throw wrapPrlctlError(action, name, error);
      }
    },
  };
}
