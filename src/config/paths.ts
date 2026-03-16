import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));

export function defaultConfigPath(): string {
  if (process.env.KIDS_ALFRED_CONFIG?.trim()) {
    return resolve(process.env.KIDS_ALFRED_CONFIG);
  }
  const home = process.env.HOME ?? process.cwd();
  return join(home, '.config', 'kfc', 'config.toml');
}

export function defaultBotWorkingDirectory(): string {
  const home = process.env.HOME ?? process.cwd();
  return join(home, '.kfc');
}

export function defaultAppPath(): string {
  return join(defaultInstallRootPath(), 'app');
}

export function defaultInstallRootPath(): string {
  if (process.env.KFC_INSTALL_DIR?.trim()) {
    return resolve(process.env.KFC_INSTALL_DIR);
  }

  const home = process.env.HOME ?? process.cwd();
  return join(home, '.local', 'share', 'kfc');
}

export function defaultInstallMetadataPath(installRoot: string = defaultInstallRootPath()): string {
  return join(installRoot, 'install-metadata.json');
}

export function currentAppPath(): string {
  return resolve(moduleDirectory, '..', '..');
}

export function resolveAppEntrypoint(relativePath: string): string {
  const installedPath = resolve(defaultAppPath(), relativePath);
  if (existsSync(installedPath)) {
    return installedPath;
  }
  return resolve(currentAppPath(), relativePath);
}

export function resolveBunExecutablePath(): string {
  if (process.env.KFC_BUN_BIN?.trim()) {
    return resolve(process.env.KFC_BUN_BIN);
  }
  if (process.versions.bun) {
    return process.execPath;
  }

  const result = spawnSync('which', ['bun'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const bunPath = result.status === 0 ? result.stdout.trim() : '';
  if (bunPath) {
    return resolve(bunPath);
  }
  throw new Error('Bun is required for installed service runtime generation, but no bun executable was found.');
}
