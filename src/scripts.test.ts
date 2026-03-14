import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

test('repository kfc wrapper invokes the CLI entrypoint', async () => {
  const wrapperPath = fileURLToPath(new URL('../kfc', import.meta.url));
  await assert.rejects(
    execFileAsync(wrapperPath),
    (error: NodeJS.ErrnoException & { stderr?: string; code?: number }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /Usage: kfc <service\|pair\|exec> \.\.\./u);
      return true;
    },
  );
});
