import process from 'node:process';

import { packageRelease } from '../src/release-packaging.ts';

function parseArgs(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    flags[token] = value;
    index += 1;
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const repoRoot = flags['--repo-root'];
const outputDir = flags['--output-dir'];
const repo = flags['--repo'];
const version = flags['--version'];
const publishedAt = flags['--published-at'];

if (!repoRoot || !outputDir || !repo || !version || !publishedAt) {
  throw new Error(
    'Usage: bun scripts/package-release.ts --repo-root <path> --output-dir <path> --repo <owner/name> --version <tag> --published-at <iso8601>',
  );
}

const result = await packageRelease({
  repoRoot,
  outputDir,
  repo,
  version,
  publishedAt,
});

process.stdout.write(
  `${JSON.stringify(
    {
      assetName: result.assetName,
      assetPath: result.assetPath,
      manifestPath: result.manifestPath,
    },
    null,
    2,
  )}\n`,
);
