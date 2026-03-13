import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package scripts include a dev mode that watches src and restarts the service', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts?.dev,
    'node --watch-path=src --experimental-strip-types src/index.ts',
  );
});
