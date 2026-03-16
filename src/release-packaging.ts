import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const RELEASE_METADATA_FILE = '.kfc-release.json';
export const RELEASE_CHANNEL = 'stable';
export const REQUIRED_RELEASE_PATHS = [
  RELEASE_METADATA_FILE,
  'src/index.ts',
  'src/kfc.ts',
  'package.json',
] as const;
export const RELEASE_INCLUDE_PATHS = [
  'src',
  'config',
  'docs',
  'package.json',
  'bun.lock',
  'install.sh',
  'uninstall.sh',
  'kfc',
  'README.md',
  'AGENTS.md',
  '.codexignore',
  'openspec',
] as const;

export interface ReleaseMetadata {
  repo: string;
  version: string;
  channel: string;
  published_at: string;
  asset_name: string;
}

export interface PackageReleaseOptions {
  repoRoot: string;
  outputDir: string;
  repo: string;
  version: string;
  publishedAt: string;
}

export function buildReleaseAssetName(version: string): string {
  return `kfc-${version}.tar.gz`;
}

export function buildReleaseMetadata(input: {
  repo: string;
  version: string;
  publishedAt: string;
}): ReleaseMetadata {
  return {
    repo: input.repo,
    version: input.version,
    channel: RELEASE_CHANNEL,
    published_at: input.publishedAt,
    asset_name: buildReleaseAssetName(input.version),
  };
}

async function stageReleaseContents(repoRoot: string, stageDir: string): Promise<void> {
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  for (const relativePath of RELEASE_INCLUDE_PATHS) {
    await cp(join(repoRoot, relativePath), join(stageDir, relativePath), {
      recursive: true,
      force: true,
    });
  }
}

export async function verifyReleaseDirectory(stageDir: string, assetName: string): Promise<void> {
  for (const relativePath of REQUIRED_RELEASE_PATHS) {
    await readFile(join(stageDir, relativePath), 'utf8').catch(() => {
      throw new Error(`Packaged release is missing required path: ${relativePath}`);
    });
  }

  const metadata = JSON.parse(
    await readFile(join(stageDir, RELEASE_METADATA_FILE), 'utf8'),
  ) as ReleaseMetadata;
  if (metadata.asset_name !== assetName) {
    throw new Error(
      `Embedded release metadata asset_name mismatch: expected ${assetName}, got ${metadata.asset_name}`,
    );
  }
}

export async function packageRelease(options: PackageReleaseOptions): Promise<{
  assetPath: string;
  assetName: string;
  manifestPath: string;
}> {
  const repoRoot = resolve(options.repoRoot);
  const outputDir = resolve(options.outputDir);
  const assetName = buildReleaseAssetName(options.version);
  const stageDir = join(outputDir, `stage-${options.version}`);
  const assetPath = join(outputDir, assetName);
  const manifestPath = join(outputDir, `${assetName}.manifest.json`);
  const metadata = buildReleaseMetadata({
    repo: options.repo,
    version: options.version,
    publishedAt: options.publishedAt,
  });

  await mkdir(outputDir, { recursive: true });
  await stageReleaseContents(repoRoot, stageDir);
  await writeFile(join(stageDir, RELEASE_METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  await verifyReleaseDirectory(stageDir, assetName);

  await execFileAsync('tar', ['-czf', assetPath, '-C', stageDir, '.']);

  const archiveListing = (
    await execFileAsync('tar', ['-tzf', assetPath])
  ).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\.\//u, ''));

  for (const requiredPath of REQUIRED_RELEASE_PATHS) {
    if (!archiveListing.includes(requiredPath)) {
      throw new Error(`Release tarball is missing required path: ${requiredPath}`);
    }
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        assetName,
        assetPath,
        metadata,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return {
    assetPath,
    assetName,
    manifestPath,
  };
}

export async function listArchiveEntries(assetPath: string): Promise<string[]> {
  return (await execFileAsync('tar', ['-tzf', assetPath])).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\.\//u, ''));
}

export async function readEmbeddedReleaseMetadataFromArchive(assetPath: string): Promise<ReleaseMetadata> {
  return JSON.parse(
    (await execFileAsync('tar', ['-xOf', assetPath, RELEASE_METADATA_FILE])).stdout,
  ) as ReleaseMetadata;
}

export async function listOutputFiles(outputDir: string): Promise<string[]> {
  return (await readdir(outputDir)).sort();
}
