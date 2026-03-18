import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import {
  defaultConfigPath,
  defaultInstallMetadataPath,
  defaultInstallRootPath,
  resolveBunExecutablePath,
} from './config/paths.ts';
import { LaunchdServiceManager, readInstalledServiceConfigPath } from './service-manager.ts';

const execFileAsync = promisify(execFile);

const RELEASE_METADATA_FILE = '.kfc-release.json';
const REQUIRED_ENTRYPOINTS = ['package.json', 'src/index.ts', 'src/kfc.ts'];

export interface ReleaseVersionInfo {
  repo: string;
  version: string;
  channel: string;
  publishedAt: string;
  assetName: string;
  downloadUrl?: string;
}

export interface InstallMetadata {
  installSource: 'github-release';
  repo: string;
  channel: string;
  currentVersion: string;
  previousVersion: string | null;
  installedAt: string;
  previousInstalledAt: string | null;
}

export type UpdateInspection =
  | {
      status: 'up_to_date';
      currentVersion: ReleaseVersionInfo;
      latestVersion: ReleaseVersionInfo;
      summary: string;
    }
  | {
      status: 'update_available';
      currentVersion: ReleaseVersionInfo;
      latestVersion: ReleaseVersionInfo;
      summary: string;
    }
  | {
      status: 'blocked';
      summary: string;
    };

export interface UpdateExecutionResult {
  previousVersion: ReleaseVersionInfo;
  currentVersion: ReleaseVersionInfo;
  summary: string;
}

export type RollbackInspection =
  | {
      status: 'rollback_available';
      currentVersion: ReleaseVersionInfo;
      previousVersion: ReleaseVersionInfo;
      summary: string;
    }
  | {
      status: 'blocked';
      summary: string;
    };

export interface RollbackExecutionResult {
  previousVersion: ReleaseVersionInfo;
  currentVersion: ReleaseVersionInfo;
  summary: string;
}

type FetchLike = typeof fetch;
type ExecFileAsync = (
  file: string,
  args: readonly string[],
  options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string }>;

interface InspectBaseOptions {
  installRoot?: string;
  installMetadataPath?: string;
  appPath?: string;
  readFileImpl?: typeof readFile;
  accessImpl?: typeof access;
  fetchImpl?: FetchLike;
}

interface PerformBaseOptions extends InspectBaseOptions {
  configPath?: string;
  now?: () => Date;
  execFileAsync?: ExecFileAsync;
  mkdirImpl?: typeof mkdir;
  mkdtempImpl?: typeof mkdtemp;
  renameImpl?: typeof rename;
  rmImpl?: typeof rm;
  writeFileImpl?: typeof writeFile;
  installDependencies?: (cwd: string) => Promise<void>;
  serviceInstaller?: (configPath: string) => Promise<void>;
  resolveInstalledConfigPath?: () => Promise<string>;
  extractTarGz?: (archivePath: string, destination: string) => Promise<void>;
}

function resolveInstallRoot(explicit?: string): string {
  return explicit ?? defaultInstallRootPath();
}

function resolveAppPath(explicitAppPath?: string, installRoot?: string): string {
  return explicitAppPath ?? join(resolveInstallRoot(installRoot), 'app');
}

function resolveMetadataPath(explicitPath?: string, installRoot?: string): string {
  return explicitPath ?? defaultInstallMetadataPath(resolveInstallRoot(installRoot));
}

function buildReleaseApiUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases/latest`;
}

function versionSummary(version: ReleaseVersionInfo): string {
  return version.version;
}

function parseJson<T>(raw: string, description: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Invalid ${description}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid ${field}`);
  }
  return value;
}

function parseEmbeddedReleaseMetadata(raw: string): ReleaseVersionInfo {
  const parsed = parseJson<Record<string, unknown>>(raw, 'embedded release metadata');
  return {
    repo: ensureString(parsed.repo, 'embedded release metadata field repo'),
    version: ensureString(parsed.version, 'embedded release metadata field version'),
    channel: ensureString(parsed.channel, 'embedded release metadata field channel'),
    publishedAt: ensureString(parsed.published_at, 'embedded release metadata field published_at'),
    assetName: ensureString(parsed.asset_name, 'embedded release metadata field asset_name'),
  };
}

function parseInstallMetadata(raw: string): InstallMetadata {
  const parsed = parseJson<Record<string, unknown>>(raw, 'install metadata');
  const installSource = ensureString(parsed.install_source, 'install metadata field install_source');
  if (installSource !== 'github-release') {
    throw new Error(`Unsupported install_source: ${installSource}`);
  }
  const previousVersion = parsed.previous_version;
  const previousInstalledAt = parsed.previous_installed_at;
  if (previousVersion !== null && previousVersion !== undefined && typeof previousVersion !== 'string') {
    throw new Error('Missing or invalid install metadata field previous_version');
  }
  if (
    previousInstalledAt !== null
    && previousInstalledAt !== undefined
    && typeof previousInstalledAt !== 'string'
  ) {
    throw new Error('Missing or invalid install metadata field previous_installed_at');
  }
  return {
    installSource: 'github-release',
    repo: ensureString(parsed.repo, 'install metadata field repo'),
    channel: ensureString(parsed.channel, 'install metadata field channel'),
    currentVersion: ensureString(parsed.current_version, 'install metadata field current_version'),
    previousVersion: previousVersion ?? null,
    installedAt: ensureString(parsed.installed_at, 'install metadata field installed_at'),
    previousInstalledAt: previousInstalledAt ?? null,
  };
}

async function readEmbeddedReleaseMetadata(
  appPath: string,
  readFileImpl: typeof readFile = readFile,
): Promise<ReleaseVersionInfo> {
  const metadataPath = join(appPath, RELEASE_METADATA_FILE);
  const raw = await readFileImpl(metadataPath, 'utf8');
  return parseEmbeddedReleaseMetadata(raw);
}

export async function readInstallMetadata(
  metadataPath: string,
  readFileImpl: typeof readFile = readFile,
): Promise<InstallMetadata> {
  const raw = await readFileImpl(metadataPath, 'utf8');
  return parseInstallMetadata(raw);
}

async function writeInstallMetadata(
  metadataPath: string,
  metadata: InstallMetadata,
  mkdirImpl: typeof mkdir = mkdir,
  writeFileImpl: typeof writeFile = writeFile,
): Promise<void> {
  await mkdirImpl(dirname(metadataPath), { recursive: true });
  await writeFileImpl(
    metadataPath,
    `${JSON.stringify(
      {
        install_source: metadata.installSource,
        repo: metadata.repo,
        channel: metadata.channel,
        current_version: metadata.currentVersion,
        previous_version: metadata.previousVersion,
        installed_at: metadata.installedAt,
        previous_installed_at: metadata.previousInstalledAt,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function ensureExists(path: string, accessImpl: typeof access = access): Promise<void> {
  await accessImpl(path, constants.F_OK);
}

function buildCurrentVersion(metadata: InstallMetadata): ReleaseVersionInfo {
  return {
    repo: metadata.repo,
    version: metadata.currentVersion,
    channel: metadata.channel,
    publishedAt: metadata.installedAt,
    assetName: `kfc-${metadata.currentVersion}.tar.gz`,
  };
}

function buildPreviousVersion(metadata: InstallMetadata): ReleaseVersionInfo {
  if (!metadata.previousVersion || !metadata.previousInstalledAt) {
    throw new Error('No rollback version is available.');
  }
  return {
    repo: metadata.repo,
    version: metadata.previousVersion,
    channel: metadata.channel,
    publishedAt: metadata.previousInstalledAt,
    assetName: `kfc-${metadata.previousVersion}.tar.gz`,
  };
}

async function queryLatestStableRelease(
  repo: string,
  fetchImpl: FetchLike = fetch,
): Promise<ReleaseVersionInfo> {
  const response = await fetchImpl(buildReleaseApiUrl(repo), {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kfc-update',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed: ${response.status} ${response.statusText}`);
  }
  const parsed = (await response.json()) as {
    tag_name?: unknown;
    draft?: unknown;
    prerelease?: unknown;
    published_at?: unknown;
    assets?: Array<{ name?: unknown; browser_download_url?: unknown }>;
  };
  if (parsed.draft === true || parsed.prerelease === true) {
    throw new Error('GitHub latest release is not a stable release');
  }
  const asset = parsed.assets?.find(
    (entry) => typeof entry.name === 'string' && entry.name.endsWith('.tar.gz')
      && typeof entry.browser_download_url === 'string'
      && entry.browser_download_url,
  );
  if (!asset) {
    throw new Error('GitHub latest stable release does not provide a .tar.gz asset');
  }
  return {
    repo,
    version: ensureString(parsed.tag_name, 'latest release tag_name'),
    channel: 'stable',
    publishedAt: ensureString(parsed.published_at, 'latest release published_at'),
    assetName: ensureString(asset.name, 'latest release asset name'),
    downloadUrl: ensureString(asset.browser_download_url, 'latest release asset URL'),
  };
}

export async function resolveServiceUpdateConfigPath(): Promise<string> {
  try {
    return await readInstalledServiceConfigPath();
  } catch {
    return defaultConfigPath();
  }
}

export async function readInstalledCurrentVersion(
  options: InspectBaseOptions = {},
): Promise<ReleaseVersionInfo> {
  const installRoot = resolveInstallRoot(options.installRoot);
  const metadataPath = resolveMetadataPath(options.installMetadataPath, installRoot);
  const metadata = await readInstallMetadata(metadataPath, options.readFileImpl ?? readFile);
  return buildCurrentVersion(metadata);
}

async function installBunDependencies(
  cwd: string,
  execImpl: ExecFileAsync,
): Promise<void> {
  await execImpl(resolveBunExecutablePath(), ['install', '--production'], { cwd });
}

async function extractTarGz(
  archivePath: string,
  destination: string,
  execImpl: ExecFileAsync,
): Promise<void> {
  await execImpl('tar', ['-xzf', archivePath, '-C', destination], {});
}

async function downloadToFile(url: string, targetPath: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'kfc-update',
    },
  });
  if (!response.ok) {
    throw new Error(`Release asset download failed: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, bytes);
}

async function resolveExtractedAppPath(
  extractionRoot: string,
  readFileImpl: typeof readFile = readFile,
): Promise<string> {
  try {
    await readFileImpl(join(extractionRoot, RELEASE_METADATA_FILE), 'utf8');
    return extractionRoot;
  } catch {
    // fall through
  }

  const candidates = await readdir(extractionRoot, { withFileTypes: true });
  for (const entry of candidates) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = join(extractionRoot, entry.name);
    try {
      await readFileImpl(join(candidate, RELEASE_METADATA_FILE), 'utf8');
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`Extracted release asset does not contain ${RELEASE_METADATA_FILE}`);
}

async function verifyAppEntrypoints(
  appPath: string,
  accessImpl: typeof access = access,
): Promise<void> {
  for (const relativePath of REQUIRED_ENTRYPOINTS) {
    await ensureExists(join(appPath, relativePath), accessImpl).catch(() => {
      throw new Error(`Staged app is missing required entrypoint: ${relativePath}`);
    });
  }
}

async function removeIfExists(path: string, rmImpl: typeof rm = rm): Promise<void> {
  await rmImpl(path, { recursive: true, force: true }).catch(() => undefined);
}

async function swapDirectories(
  firstPath: string,
  secondPath: string,
  tempPath: string,
  renameImpl: typeof rename = rename,
): Promise<void> {
  await renameImpl(firstPath, tempPath);
  try {
    await renameImpl(secondPath, firstPath);
    await renameImpl(tempPath, secondPath);
  } catch (error) {
    await renameImpl(tempPath, firstPath).catch(() => undefined);
    throw error;
  }
}

function createInstallMetadataFromRelease(
  release: ReleaseVersionInfo,
  nowIso: string,
  previous?: InstallMetadata,
): InstallMetadata {
  return {
    installSource: 'github-release',
    repo: release.repo,
    channel: release.channel,
    currentVersion: release.version,
    previousVersion: previous?.currentVersion ?? null,
    installedAt: nowIso,
    previousInstalledAt: previous?.installedAt ?? null,
  };
}

export async function inspectUpdateState(
  options: InspectBaseOptions = {},
): Promise<UpdateInspection> {
  const installRoot = resolveInstallRoot(options.installRoot);
  const metadataPath = resolveMetadataPath(options.installMetadataPath, installRoot);
  const readFileImpl = options.readFileImpl ?? readFile;
  const fetchImpl = options.fetchImpl ?? fetch;

  let metadata: InstallMetadata;
  try {
    metadata = await readInstallMetadata(metadataPath, readFileImpl);
  } catch (error) {
    return {
      status: 'blocked',
      summary: `Update blocked: install metadata is unusable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  let latestVersion: ReleaseVersionInfo;
  try {
    latestVersion = await queryLatestStableRelease(metadata.repo, fetchImpl);
  } catch (error) {
    return {
      status: 'blocked',
      summary: `Update blocked: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const currentVersion = buildCurrentVersion(metadata);
  if (currentVersion.version === latestVersion.version) {
    return {
      status: 'up_to_date',
      currentVersion,
      latestVersion,
      summary: `Already at ${versionSummary(currentVersion)}.`,
    };
  }

  return {
    status: 'update_available',
    currentVersion,
    latestVersion,
    summary: `Update available: ${versionSummary(currentVersion)} -> ${versionSummary(latestVersion)}.`,
  };
}

export async function inspectRollbackState(
  options: InspectBaseOptions = {},
): Promise<RollbackInspection> {
  const installRoot = resolveInstallRoot(options.installRoot);
  const metadataPath = resolveMetadataPath(options.installMetadataPath, installRoot);
  const appPreviousPath = join(installRoot, 'app.previous');
  const readFileImpl = options.readFileImpl ?? readFile;
  const accessImpl = options.accessImpl ?? access;

  let metadata: InstallMetadata;
  try {
    metadata = await readInstallMetadata(metadataPath, readFileImpl);
  } catch (error) {
    return {
      status: 'blocked',
      summary: `Rollback blocked: install metadata is unusable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  try {
    await ensureExists(appPreviousPath, accessImpl);
  } catch {
    return {
      status: 'blocked',
      summary: 'No rollback version is available.',
    };
  }

  try {
    const previousVersion = buildPreviousVersion(metadata);
    return {
      status: 'rollback_available',
      currentVersion: buildCurrentVersion(metadata),
      previousVersion,
      summary: `Rollback available: ${metadata.currentVersion} -> ${previousVersion.version}.`,
    };
  } catch {
    return {
      status: 'blocked',
      summary: 'No rollback version is available.',
    };
  }
}

export async function performSelfUpdate(
  inspection: Extract<UpdateInspection, { status: 'update_available' }>,
  options: PerformBaseOptions = {},
): Promise<UpdateExecutionResult> {
  const installRoot = resolveInstallRoot(options.installRoot);
  const appPath = resolveAppPath(options.appPath, installRoot);
  const metadataPath = resolveMetadataPath(options.installMetadataPath, installRoot);
  const appNewPath = join(installRoot, 'app.new');
  const appPreviousPath = join(installRoot, 'app.previous');
  const previousBackupPath = join(installRoot, '.app.previous.backup');
  const failedStagePath = join(installRoot, '.app.failed-stage');
  const execImpl = options.execFileAsync ?? execFileAsync;
  const fetchImpl = options.fetchImpl ?? fetch;
  const mkdirImpl = options.mkdirImpl ?? mkdir;
  const mkdtempImpl = options.mkdtempImpl ?? mkdtemp;
  const renameImpl = options.renameImpl ?? rename;
  const rmImpl = options.rmImpl ?? rm;
  const writeFileImpl = options.writeFileImpl ?? writeFile;
  const readFileImpl = options.readFileImpl ?? readFile;
  const accessImpl = options.accessImpl ?? access;
  const now = options.now ?? (() => new Date());
  const configPath =
    options.configPath ??
    (await (options.resolveInstalledConfigPath ?? resolveServiceUpdateConfigPath)());
  const installDependencies =
    options.installDependencies ?? (async (cwd: string) => await installBunDependencies(cwd, execImpl));
  const serviceInstaller =
    options.serviceInstaller ??
    (async (path: string) => await new LaunchdServiceManager({ execFileAsync: execImpl }).install(path));
  const extractImpl =
    options.extractTarGz ?? (async (archivePath: string, destination: string) => await extractTarGz(archivePath, destination, execImpl));

  const previousMetadata = await readInstallMetadata(metadataPath, readFileImpl);
  if (!inspection.latestVersion.downloadUrl) {
    throw new Error('Update blocked: latest release does not include a downloadable asset URL.');
  }

  await mkdirImpl(installRoot, { recursive: true });
  const stagingRoot = await mkdtempImpl(join(installRoot, '.release-stage-'));
  let previousBackupExists = false;
  try {
    const archivePath = join(stagingRoot, inspection.latestVersion.assetName);
    const extractionRoot = join(stagingRoot, 'extracted');
    await mkdirImpl(extractionRoot, { recursive: true });
    await downloadToFile(inspection.latestVersion.downloadUrl, archivePath, fetchImpl);
    await extractImpl(archivePath, extractionRoot);

    const extractedAppPath = await resolveExtractedAppPath(extractionRoot, readFileImpl);
    const embeddedMetadata = await readEmbeddedReleaseMetadata(extractedAppPath, readFileImpl);
    if (
      embeddedMetadata.repo !== inspection.latestVersion.repo
      || embeddedMetadata.version !== inspection.latestVersion.version
      || embeddedMetadata.channel !== inspection.latestVersion.channel
      || embeddedMetadata.assetName !== inspection.latestVersion.assetName
    ) {
      throw new Error(
        `Embedded release metadata does not match the selected release: expected ${inspection.latestVersion.version}/${inspection.latestVersion.assetName}.`,
      );
    }

    await removeIfExists(appNewPath, rmImpl);
    await renameImpl(extractedAppPath, appNewPath);
    await installDependencies(appNewPath);
    await verifyAppEntrypoints(appNewPath, accessImpl);

    await removeIfExists(previousBackupPath, rmImpl);
    try {
      await renameImpl(appPreviousPath, previousBackupPath);
      previousBackupExists = true;
    } catch {
      previousBackupExists = false;
    }

    await renameImpl(appPath, appPreviousPath);
    await renameImpl(appNewPath, appPath);

    try {
      await serviceInstaller(configPath);
    } catch (error) {
      const restoreError = await (async () => {
        await removeIfExists(failedStagePath, rmImpl);
        await renameImpl(appPath, failedStagePath);
        await renameImpl(appPreviousPath, appPath);
        if (previousBackupExists) {
          await renameImpl(previousBackupPath, appPreviousPath);
        } else {
          await removeIfExists(appPreviousPath, rmImpl);
        }
        await removeIfExists(failedStagePath, rmImpl);
      })().catch((restoreFailure) => restoreFailure);

      if (restoreError) {
        throw new Error(
          `Update failed, and automatic rollback also failed; manual recovery is required: ${
            restoreError instanceof Error ? restoreError.message : String(restoreError)
          }`,
        );
      }

      throw new Error(
        `Update failed during service refresh; rolled back to ${previousMetadata.currentVersion}.`,
      );
    }

    const nextMetadata = createInstallMetadataFromRelease(embeddedMetadata, now().toISOString(), previousMetadata);
    await writeInstallMetadata(metadataPath, nextMetadata, mkdirImpl, writeFileImpl);
    await removeIfExists(previousBackupPath, rmImpl);

    return {
      previousVersion: inspection.currentVersion,
      currentVersion: embeddedMetadata,
      summary: `Update complete. Current version: ${embeddedMetadata.version}.`,
    };
  } finally {
    await removeIfExists(appNewPath, rmImpl).catch(() => undefined);
    await removeIfExists(stagingRoot, rmImpl).catch(() => undefined);
  }
}

export async function performRollback(
  inspection: Extract<RollbackInspection, { status: 'rollback_available' }>,
  options: PerformBaseOptions = {},
): Promise<RollbackExecutionResult> {
  const installRoot = resolveInstallRoot(options.installRoot);
  const appPath = resolveAppPath(options.appPath, installRoot);
  const metadataPath = resolveMetadataPath(options.installMetadataPath, installRoot);
  const appPreviousPath = join(installRoot, 'app.previous');
  const tempSwapPath = join(installRoot, '.app.rollback-swap');
  const renameImpl = options.renameImpl ?? rename;
  const rmImpl = options.rmImpl ?? rm;
  const mkdirImpl = options.mkdirImpl ?? mkdir;
  const writeFileImpl = options.writeFileImpl ?? writeFile;
  const readFileImpl = options.readFileImpl ?? readFile;
  const execImpl = options.execFileAsync ?? execFileAsync;
  const now = options.now ?? (() => new Date());
  const configPath =
    options.configPath ??
    (await (options.resolveInstalledConfigPath ?? resolveServiceUpdateConfigPath)());
  const serviceInstaller =
    options.serviceInstaller ??
    (async (path: string) => await new LaunchdServiceManager({ execFileAsync: execImpl }).install(path));

  await removeIfExists(tempSwapPath, rmImpl);
  await swapDirectories(appPath, appPreviousPath, tempSwapPath, renameImpl);

  try {
    await serviceInstaller(configPath);
  } catch (error) {
    const restoreError = await swapDirectories(appPath, appPreviousPath, tempSwapPath, renameImpl).catch(
      (restoreFailure) => restoreFailure,
    );
    if (restoreError) {
      throw new Error(
        `Rollback failed, and automatic restoration also failed; manual recovery is required: ${
          restoreError instanceof Error ? restoreError.message : String(restoreError)
        }`,
      );
    }
    throw new Error(
      `Rollback failed during service refresh; automatically restored to ${inspection.currentVersion.version}.`,
    );
  }

  const previousMetadata = await readInstallMetadata(metadataPath, readFileImpl);
  const nextMetadata: InstallMetadata = {
    installSource: 'github-release',
    repo: previousMetadata.repo,
    channel: previousMetadata.channel,
    currentVersion: inspection.previousVersion.version,
    previousVersion: inspection.currentVersion.version,
    installedAt: now().toISOString(),
    previousInstalledAt: previousMetadata.installedAt,
  };
  await writeInstallMetadata(metadataPath, nextMetadata, mkdirImpl, writeFileImpl);

  return {
    previousVersion: inspection.currentVersion,
    currentVersion: inspection.previousVersion,
    summary: `Rollback complete. Current version: ${inspection.previousVersion.version}.`,
  };
}
