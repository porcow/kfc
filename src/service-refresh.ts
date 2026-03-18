import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import type {
  ReleaseVersionInfo,
  RollbackExecutionResult,
  RollbackInspection,
  UpdateExecutionResult,
  UpdateInspection,
} from './update.ts';
import {
  defaultInstallRootPath,
  resolveAppEntrypoint,
  resolveBunExecutablePath,
} from './config/paths.ts';
import { loadConfig } from './config/schema.ts';
import type { RunRecord, ServiceRefreshOperationRecord, ServiceRefreshOperationState, TaskResult } from './domain.ts';
import { RunRepository } from './persistence/run-repository.ts';
import { ServiceRefreshRepository } from './persistence/service-refresh-repository.ts';
import {
  inspectRollbackState,
  inspectUpdateState,
  performRollback,
  performSelfUpdate,
  readInstalledCurrentVersion,
  resolveServiceUpdateConfigPath,
} from './update.ts';

const execFileAsync = promisify(execFile);

interface OperationTargetPayload {
  currentVersion: ReleaseVersionInfo;
  targetVersion: ReleaseVersionInfo;
}

interface PreparedRefreshResult {
  operationId: string;
  summary: string;
}

interface PrepareOptions {
  configPath?: string;
  installRoot?: string;
  botId?: string;
  runId?: string;
  now?: () => Date;
  execFileAsync?: typeof execFileAsync;
  writeFileImpl?: typeof writeFile;
  mkdirImpl?: typeof mkdir;
  unlinkImpl?: typeof unlink;
  loadConfigImpl?: typeof loadConfig;
}

interface ExecuteHelperOptions {
  installRoot?: string;
  now?: () => Date;
  execFileAsync?: typeof execFileAsync;
  unlinkImpl?: typeof unlink;
  performSelfUpdateImpl?: typeof performSelfUpdate;
  performRollbackImpl?: typeof performRollback;
}

interface StartupReconcileTarget {
  publishRunUpdate(run: RunRecord): Promise<void>;
}

function resolveInstallRoot(explicit?: string): string {
  return explicit ?? defaultInstallRootPath();
}

function serviceRefreshRepositoryPath(installRoot: string): string {
  return join(installRoot, 'service-refresh.sqlite');
}

function helperDirectory(installRoot: string): string {
  return join(installRoot, 'self-refresh-helpers');
}

function helperLabel(operationId: string): string {
  return `com.kidsalfred.self-refresh.${operationId}`;
}

function helperPlistPath(installRoot: string, operationId: string): string {
  return join(helperDirectory(installRoot), `${helperLabel(operationId)}.plist`);
}

function buildHelperPlist(operationId: string): string {
  const label = helperLabel(operationId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${resolveBunExecutablePath()}</string>
      <string>${resolveAppEntrypoint('src/kfc.ts')}</string>
      <string>internal-run-self-refresh</string>
      <string>--operation-id</string>
      <string>${operationId}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>`;
}

function terminalOperationStateFromSummary(summary: string): ServiceRefreshOperationState {
  if (summary.includes('manual recovery is required')) {
    return 'manual_recovery_required';
  }
  if (summary.includes('rolled back to') || summary.includes('automatically restored')) {
    return 'restored_previous_version';
  }
  return 'failed';
}

async function resolveRunContext(
  configPath: string,
  botId: string | undefined,
  runId: string | undefined,
  loadConfigImpl: typeof loadConfig,
): Promise<{ botId?: string; sqlitePath?: string; runId?: string }> {
  if (!botId || !runId) {
    return {};
  }
  const config = await loadConfigImpl(configPath);
  const bot = config.bots[botId];
  if (!bot) {
    return {};
  }
  return {
    botId,
    runId,
    sqlitePath: bot.storage.sqlitePath,
  };
}

async function serviceRefreshRepositoryExists(installRoot: string): Promise<boolean> {
  const path = serviceRefreshRepositoryPath(installRoot);
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function persistPreparedOperation(
  kind: ServiceRefreshOperationRecord['kind'],
  payload: OperationTargetPayload,
  options: PrepareOptions,
): Promise<{
  operation: ServiceRefreshOperationRecord;
  repository: ServiceRefreshRepository;
  installRoot: string;
}> {
  const now = options.now ?? (() => new Date());
  const installRoot = resolveInstallRoot(options.installRoot);
  const configPath = options.configPath ?? (await resolveServiceUpdateConfigPath());
  const loadConfigImpl = options.loadConfigImpl ?? loadConfig;
  const writeFileImpl = options.writeFileImpl ?? writeFile;
  const mkdirImpl = options.mkdirImpl ?? mkdir;
  const repo = new ServiceRefreshRepository(serviceRefreshRepositoryPath(installRoot));
  const operationId = randomUUID();
  const label = helperLabel(operationId);
  const plistPath = helperPlistPath(installRoot, operationId);
  const runContext = await resolveRunContext(configPath, options.botId, options.runId, loadConfigImpl);

  try {
    await mkdirImpl(helperDirectory(installRoot), { recursive: true });
    const operation = repo.createOperation({
      operationId,
      kind,
      state: 'prepared',
      configPath,
      payloadJson: JSON.stringify(payload),
      runId: runContext.runId,
      botId: runContext.botId,
      sqlitePath: runContext.sqlitePath,
      helperLabel: label,
      helperPlistPath: plistPath,
      notificationPending: Boolean(runContext.runId),
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
    });
    await writeFileImpl(plistPath, buildHelperPlist(operationId), 'utf8');
    return {
      operation,
      repository: repo,
      installRoot,
    };
  } catch (error) {
    repo.close();
    throw error;
  }
}

async function launchPreparedOperation(
  operation: ServiceRefreshOperationRecord,
  repository: ServiceRefreshRepository,
  execImpl: typeof execFileAsync,
  unlinkImpl: typeof unlink,
): Promise<void> {
  try {
    await execImpl('launchctl', ['bootstrap', `gui/${process.getuid()}`, operation.helperPlistPath!]);
    await execImpl('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${operation.helperLabel}`]);
    repository.updateOperation(operation.operationId, {
      state: 'helper_bootstrapped',
      summary: 'Self-refresh handed off to detached helper.',
    });
  } catch (error) {
    repository.updateOperation(operation.operationId, {
      state: 'failed',
      summary: `Failed to start detached self-refresh helper: ${
        error instanceof Error ? error.message : String(error)
      }`,
      notificationPending: false,
      finishedAt: new Date().toISOString(),
    });
    await unlinkImpl(operation.helperPlistPath!).catch(() => undefined);
    throw new Error(
      `Failed to start detached self-refresh helper: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    repository.close();
  }
}

export async function prepareSelfUpdateHandoff(
  inspection: Extract<UpdateInspection, { status: 'update_available' }>,
  options: PrepareOptions = {},
): Promise<PreparedRefreshResult> {
  const { operation, repository } = await persistPreparedOperation(
    'update',
    {
      currentVersion: inspection.currentVersion,
      targetVersion: inspection.latestVersion,
    },
    options,
  );
  await launchPreparedOperation(
    operation,
    repository,
    options.execFileAsync ?? execFileAsync,
    options.unlinkImpl ?? unlink,
  );
  return {
    operationId: operation.operationId,
    summary: `Update handed off to detached helper. Operation: ${operation.operationId}.`,
  };
}

export async function prepareRollbackHandoff(
  inspection: Extract<RollbackInspection, { status: 'rollback_available' }>,
  options: PrepareOptions = {},
): Promise<PreparedRefreshResult> {
  const { operation, repository } = await persistPreparedOperation(
    'rollback',
    {
      currentVersion: inspection.currentVersion,
      targetVersion: inspection.previousVersion,
    },
    options,
  );
  await launchPreparedOperation(
    operation,
    repository,
    options.execFileAsync ?? execFileAsync,
    options.unlinkImpl ?? unlink,
  );
  return {
    operationId: operation.operationId,
    summary: `Rollback handed off to detached helper. Operation: ${operation.operationId}.`,
  };
}

async function updateLinkedRun(
  operation: ServiceRefreshOperationRecord,
  state: RunRecord['state'],
  summary: string,
  result?: TaskResult,
): Promise<void> {
  if (!operation.sqlitePath || !operation.runId) {
    return;
  }
  const repo = new RunRepository(operation.sqlitePath);
  try {
    repo.updateRun(operation.runId, {
      state,
      finishedAt: new Date().toISOString(),
      statusSummary: summary,
      resultJson: result ? JSON.stringify(result) : JSON.stringify({ summary }),
    });
  } finally {
    repo.close();
  }
}

async function cleanupHelperArtifacts(
  operation: ServiceRefreshOperationRecord,
  execImpl: typeof execFileAsync,
  unlinkImpl: typeof unlink,
): Promise<void> {
  if (operation.helperPlistPath) {
    await unlinkImpl(operation.helperPlistPath).catch(() => undefined);
  }
  if (operation.helperLabel) {
    await execImpl('launchctl', ['bootout', `gui/${process.getuid()}/${operation.helperLabel}`]).catch(
      () => undefined,
    );
  }
}

export async function runDetachedServiceRefreshOperation(
  operationId: string,
  options: ExecuteHelperOptions = {},
): Promise<{ summary: string }> {
  const installRoot = resolveInstallRoot(options.installRoot);
  const repo = new ServiceRefreshRepository(serviceRefreshRepositoryPath(installRoot));
  const execImpl = options.execFileAsync ?? execFileAsync;
  const unlinkImpl = options.unlinkImpl ?? unlink;
  const performSelfUpdateImpl = options.performSelfUpdateImpl ?? performSelfUpdate;
  const performRollbackImpl = options.performRollbackImpl ?? performRollback;
  const operation = repo.getOperation(operationId);
  if (!operation) {
    repo.close();
    throw new Error(`Service refresh operation not found: ${operationId}`);
  }
  if (!repo.claimOperation(operationId)) {
    repo.close();
    return {
      summary: `Service refresh operation ${operationId} was already claimed.`,
    };
  }

  try {
    const payload = JSON.parse(operation.payloadJson) as OperationTargetPayload;
    if (operation.kind === 'update') {
      const result = await performSelfUpdateImpl(
        {
          status: 'update_available',
          currentVersion: payload.currentVersion,
          latestVersion: payload.targetVersion,
          summary: `Update available: ${payload.currentVersion.version} -> ${payload.targetVersion.version}.`,
        },
        {
          installRoot,
          configPath: operation.configPath,
          execFileAsync: execImpl,
        },
      );
      repo.updateOperation(operationId, {
        state: 'succeeded',
        summary: result.summary,
        finishedAt: new Date().toISOString(),
      });
      await updateLinkedRun(operation, 'succeeded', result.summary, {
        summary: result.summary,
        data: {
          previousVersion: result.previousVersion,
          currentVersion: result.currentVersion,
        },
      });
      return { summary: result.summary };
    }

    const result = await performRollbackImpl(
      {
        status: 'rollback_available',
        currentVersion: payload.currentVersion,
        previousVersion: payload.targetVersion,
        summary: `Rollback available: ${payload.currentVersion.version} -> ${payload.targetVersion.version}.`,
      },
      {
        installRoot,
        configPath: operation.configPath,
        execFileAsync: execImpl,
      },
    );
    repo.updateOperation(operationId, {
      state: 'succeeded',
      summary: result.summary,
      finishedAt: new Date().toISOString(),
    });
    await updateLinkedRun(operation, 'succeeded', result.summary, {
      summary: result.summary,
      data: {
        previousVersion: result.previousVersion,
        currentVersion: result.currentVersion,
      },
    });
    return { summary: result.summary };
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    const terminalState = terminalOperationStateFromSummary(summary);
    repo.updateOperation(operationId, {
      state: terminalState,
      summary,
      finishedAt: new Date().toISOString(),
    });
    await updateLinkedRun(operation, 'failed', summary, {
      summary,
      stderr: summary,
      exitCode: 1,
    });
    throw error;
  } finally {
    const latest = repo.getOperation(operationId) ?? operation;
    repo.close();
    await cleanupHelperArtifacts(latest, execImpl, unlinkImpl);
  }
}

function reconcileStateFromCurrentVersion(
  operation: ServiceRefreshOperationRecord,
  currentVersion: string | undefined,
): { state: ServiceRefreshOperationState; summary: string } {
  const payload = JSON.parse(operation.payloadJson) as OperationTargetPayload;
  if (currentVersion === payload.targetVersion.version) {
    return {
      state: 'succeeded',
      summary:
        operation.kind === 'update'
          ? `Update complete. Current version: ${payload.targetVersion.version}.`
          : `Rollback complete. Current version: ${payload.targetVersion.version}.`,
    };
  }
  if (currentVersion === payload.currentVersion.version) {
    return {
      state: operation.state === 'refreshing' ? 'restored_previous_version' : 'failed',
      summary:
        operation.kind === 'update'
          ? operation.state === 'refreshing'
            ? `Update failed during service refresh; rolled back to ${payload.currentVersion.version}.`
            : 'Self-update handoff did not complete before service restart.'
          : operation.state === 'refreshing'
            ? `Rollback failed during service refresh; automatically restored to ${payload.currentVersion.version}.`
            : 'Self-rollback handoff did not complete before service restart.',
    };
  }
  return {
    state: 'failed',
    summary: 'Self-refresh operation did not converge to a known installed version.',
  };
}

export async function reconcilePendingServiceRefreshOperations(
  servicesByBotId: Map<string, StartupReconcileTarget>,
  options: { installRoot?: string } = {},
): Promise<void> {
  const installRoot = resolveInstallRoot(options.installRoot);
  if (!(await serviceRefreshRepositoryExists(installRoot))) {
    return;
  }
  const repo = new ServiceRefreshRepository(serviceRefreshRepositoryPath(installRoot));
  try {
    const pending = repo.listByStates(['prepared', 'helper_bootstrapped', 'refreshing']);
    for (const operation of pending) {
      const currentVersion = await readInstalledCurrentVersion({ installRoot }).catch(() => undefined);
      const reconciled = reconcileStateFromCurrentVersion(operation, currentVersion?.version);
      repo.updateOperation(operation.operationId, {
        state: reconciled.state,
        summary: reconciled.summary,
        finishedAt: new Date().toISOString(),
      });
      await updateLinkedRun(
        operation,
        reconciled.state === 'succeeded' ? 'succeeded' : 'failed',
        reconciled.summary,
        {
          summary: reconciled.summary,
          stderr: reconciled.state === 'succeeded' ? undefined : reconciled.summary,
          exitCode: reconciled.state === 'succeeded' ? 0 : 1,
        },
      );
    }

    const toNotify = repo.listNotificationPending();
    for (const operation of toNotify) {
      if (!operation.botId || !operation.sqlitePath || !operation.runId) {
        repo.updateOperation(operation.operationId, { notificationPending: false });
        continue;
      }
      const service = servicesByBotId.get(operation.botId);
      if (!service) {
        continue;
      }
      const runRepo = new RunRepository(operation.sqlitePath);
      try {
        const run = runRepo.getRun(operation.runId);
        if (!run) {
          repo.updateOperation(operation.operationId, { notificationPending: false });
          continue;
        }
        await service.publishRunUpdate(run);
        repo.updateOperation(operation.operationId, { notificationPending: false });
      } finally {
        runRepo.close();
      }
    }
  } finally {
    repo.close();
  }
}

export async function cliUpdateViaPreparedHandoff(
  inspection: Extract<UpdateInspection, { status: 'update_available' }>,
  options: PrepareOptions = {},
): Promise<UpdateExecutionResult> {
  const result = await prepareSelfUpdateHandoff(inspection, options);
  return {
    previousVersion: inspection.currentVersion,
    currentVersion: inspection.latestVersion,
    summary: result.summary,
  };
}

export async function cliRollbackViaPreparedHandoff(
  inspection: Extract<RollbackInspection, { status: 'rollback_available' }>,
  options: PrepareOptions = {},
): Promise<RollbackExecutionResult> {
  const result = await prepareRollbackHandoff(inspection, options);
  return {
    previousVersion: inspection.currentVersion,
    currentVersion: inspection.previousVersion,
    summary: result.summary,
  };
}
