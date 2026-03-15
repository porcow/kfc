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
  if (process.env.KFC_INSTALL_DIR?.trim()) {
    return resolve(process.env.KFC_INSTALL_DIR, 'app');
  }

  const home = process.env.HOME ?? process.cwd();
  return join(home, '.local', 'share', 'kfc', 'app');
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
