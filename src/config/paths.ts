import { join, resolve } from 'node:path';
import process from 'node:process';

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
