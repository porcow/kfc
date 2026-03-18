import { readFile } from 'node:fs/promises';

import { isServiceInstalled } from './service-manager.ts';
import { readInstalledCurrentVersion } from './update.ts';

export async function readCurrentVersionLabel(): Promise<string> {
  if (await isServiceInstalled()) {
    try {
      return (await readInstalledCurrentVersion()).version;
    } catch {
      // Fall back to repository package.json when install metadata is unavailable.
    }
  }

  const packageJsonPath = new URL('../package.json', import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
    return packageJson.version;
  }
  throw new Error('Unable to determine current version.');
}
