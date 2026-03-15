import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { currentAppPath, defaultConfigPath } from './config/paths.ts';
import { LaunchdServiceManager, readInstalledServiceConfigPath } from './service-manager.ts';

const execFileAsync = promisify(execFile);

export interface UpdateVersionInfo {
  branch: string;
  commit: string;
  upstreamBranch?: string;
}

export type UpdateInspection =
  | {
      status: 'up_to_date';
      currentVersion: UpdateVersionInfo;
      latestVersion: UpdateVersionInfo;
      summary: string;
    }
  | {
      status: 'update_available';
      currentVersion: UpdateVersionInfo;
      latestVersion: UpdateVersionInfo;
      summary: string;
    }
  | {
      status: 'blocked';
      summary: string;
    };

export interface UpdateExecutionResult {
  previousVersion: UpdateVersionInfo;
  currentVersion: UpdateVersionInfo;
  summary: string;
}

type ExecFileAsync = (
  file: string,
  args: readonly string[],
  options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string }>;

interface InspectUpdateStateOptions {
  cwd?: string;
  execFileAsync?: ExecFileAsync;
}

interface PerformSelfUpdateOptions {
  cwd?: string;
  execFileAsync?: ExecFileAsync;
  configPath?: string;
  installDependencies?: (cwd: string) => Promise<void>;
  serviceInstaller?: (configPath: string) => Promise<void>;
  resolveInstalledConfigPath?: () => Promise<string>;
}

async function runCommand(
  execImpl: ExecFileAsync,
  file: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const result = await execImpl(file, args, { cwd });
  return result.stdout.trim();
}

async function tryRunCommand(
  execImpl: ExecFileAsync,
  file: string,
  args: string[],
  cwd: string,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    return {
      ok: true,
      stdout: await runCommand(execImpl, file, args, cwd),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readVersionInfo(
  cwd: string,
  execImpl: ExecFileAsync,
): Promise<{ branch: string; commit: string }> {
  const branch = await runCommand(execImpl, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const commit = await runCommand(execImpl, 'git', ['rev-parse', '--short', 'HEAD'], cwd);
  return {
    branch,
    commit,
  };
}

export async function inspectUpdateState(
  options: InspectUpdateStateOptions = {},
): Promise<UpdateInspection> {
  const cwd = options.cwd ?? currentAppPath();
  const execImpl = options.execFileAsync ?? execFileAsync;

  const repoCheck = await tryRunCommand(
    execImpl,
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    cwd,
  );
  if (!repoCheck.ok || repoCheck.stdout !== 'true') {
    return {
      status: 'blocked',
      summary: `Update blocked: ${cwd} is not a git working tree.`,
    };
  }

  const statusOutput = await runCommand(execImpl, 'git', ['status', '--porcelain'], cwd);
  if (statusOutput.trim()) {
    return {
      status: 'blocked',
      summary: 'Update blocked: working tree has uncommitted changes.',
    };
  }

  const version = await readVersionInfo(cwd, execImpl);
  const upstream = await tryRunCommand(
    execImpl,
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    cwd,
  );
  if (!upstream.ok || !upstream.stdout) {
    return {
      status: 'blocked',
      summary: 'Update blocked: no upstream tracking branch is configured.',
    };
  }

  try {
    await runCommand(execImpl, 'git', ['fetch', '--prune'], cwd);
  } catch (error) {
    return {
      status: 'blocked',
      summary: `Update blocked: failed to fetch upstream changes: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const upstreamCommit = await runCommand(execImpl, 'git', ['rev-parse', '--short', '@{u}'], cwd);
  const counts = await runCommand(
    execImpl,
    'git',
    ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
    cwd,
  );
  const [aheadText, behindText] = counts.split(/\s+/u);
  const ahead = Number(aheadText ?? '0');
  const behind = Number(behindText ?? '0');

  if (ahead === 0 && behind === 0) {
    return {
      status: 'up_to_date',
      currentVersion: {
        ...version,
        upstreamBranch: upstream.stdout,
      },
      latestVersion: {
        branch: version.branch,
        commit: upstreamCommit,
        upstreamBranch: upstream.stdout,
      },
      summary: `Already up to date at ${version.branch}@${version.commit}.`,
    };
  }

  if (ahead === 0 && behind > 0) {
    return {
      status: 'update_available',
      currentVersion: {
        ...version,
        upstreamBranch: upstream.stdout,
      },
      latestVersion: {
        branch: version.branch,
        commit: upstreamCommit,
        upstreamBranch: upstream.stdout,
      },
      summary: `Update available: ${version.branch}@${version.commit} -> ${version.branch}@${upstreamCommit}.`,
    };
  }

  if (ahead > 0 && behind === 0) {
    return {
      status: 'blocked',
      summary: 'Update blocked: local branch is ahead of upstream.',
    };
  }

  return {
    status: 'blocked',
    summary: 'Update blocked: local branch has diverged from upstream.',
  };
}

async function resolveServiceUpdateConfigPath(): Promise<string> {
  try {
    return await readInstalledServiceConfigPath();
  } catch {
    return defaultConfigPath();
  }
}

async function installNpmDependencies(cwd: string, execImpl: ExecFileAsync): Promise<void> {
  await execImpl('npm', ['install', '--omit=dev'], { cwd });
}

export async function performSelfUpdate(
  inspection: Extract<UpdateInspection, { status: 'update_available' }>,
  options: PerformSelfUpdateOptions = {},
): Promise<UpdateExecutionResult> {
  const cwd = options.cwd ?? currentAppPath();
  const execImpl = options.execFileAsync ?? execFileAsync;
  const configPath =
    options.configPath ??
    (await (options.resolveInstalledConfigPath ?? resolveServiceUpdateConfigPath)());
  const installDependencies =
    options.installDependencies ??
    (async (installCwd: string) => {
      await installNpmDependencies(installCwd, execImpl);
    });
  const serviceInstaller =
    options.serviceInstaller ??
    (async (path: string) => {
      await new LaunchdServiceManager({ execFileAsync: execImpl }).install(path);
    });

  await runCommand(execImpl, 'git', ['pull', '--ff-only'], cwd);
  await installDependencies(cwd);
  await serviceInstaller(configPath);
  const currentVersion = {
    ...(await readVersionInfo(cwd, execImpl)),
    upstreamBranch: inspection.currentVersion.upstreamBranch,
  };
  return {
    previousVersion: inspection.currentVersion,
    currentVersion,
    summary: `Update complete: ${inspection.currentVersion.branch}@${inspection.currentVersion.commit} -> ${currentVersion.branch}@${currentVersion.commit}.`,
  };
}
