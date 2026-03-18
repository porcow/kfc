import { test } from './test-compat.ts';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('package scripts use Bun for local start, dev, and test entrypoints', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.start, 'bun src/index.ts');
  assert.equal(
    packageJson.scripts?.dev,
    'bun --watch src/index.ts',
  );
  assert.equal(packageJson.scripts?.test, 'bun test');
});

test('repository kfc wrapper invokes the CLI entrypoint', async () => {
  const wrapperPath = fileURLToPath(new URL('../kfc', import.meta.url));
  const wrapper = await readFile(wrapperPath, 'utf8');
  assert.ok(wrapper.startsWith('#!/usr/bin/env bun'));
  await assert.rejects(
    execFileAsync(wrapperPath),
    (error: NodeJS.ErrnoException & { stderr?: string; code?: number }) => {
      assert.equal(error.code, 1);
      assert.match(
        error.stderr ?? '',
        /Usage: kfc <service\|health\|version\|update\|rollback\|pair\|exec\|uninstall> \.\.\./u,
      );
      return true;
    },
  );
});
