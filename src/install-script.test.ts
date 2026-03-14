import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

test('install.sh exists, is executable, and documents the expected install flow', async () => {
  const scriptPath = resolve(process.cwd(), 'install.sh');
  await access(scriptPath, constants.F_OK);
  await access(scriptPath, constants.X_OK);

  const script = await readFile(scriptPath, 'utf8');
  const details = await stat(scriptPath);

  assert.ok(details.isFile());
  assert.ok(script.startsWith('#!/bin/sh'));
  assert.match(script, /porcow\/kfc/);
  assert.match(script, /npm install --omit=dev/);
  assert.match(script, /KFC_INSTALL_DIR/);
  assert.match(script, /KFC_BIN_DIR/);
  assert.match(script, /KFC_CONFIG_PATH/);
  assert.match(script, /KFC_REF/);
  assert.match(script, /config\/example\.bot\.toml/);
  assert.match(script, /kfc service install --config/);
});

test('uninstall.sh exists, is executable, and documents the expected uninstall flow', async () => {
  const scriptPath = resolve(process.cwd(), 'uninstall.sh');
  await access(scriptPath, constants.F_OK);
  await access(scriptPath, constants.X_OK);

  const script = await readFile(scriptPath, 'utf8');
  const details = await stat(scriptPath);

  assert.ok(details.isFile());
  assert.ok(script.startsWith('#!/bin/sh'));
  assert.match(script, /KFC_INSTALL_DIR/);
  assert.match(script, /KFC_BIN_DIR/);
  assert.match(script, /KFC_CONFIG_PATH/);
  assert.match(script, /KFC_WORK_DIR/);
  assert.match(script, /kfc uninstall --yes/);
  assert.match(script, /Library\/LaunchAgents\/com\.kidsalfred\.service\.plist/);
  assert.match(script, /launchctl bootout/);
  assert.match(script, /find "\$\{KFC_WORK_DIR\}" -type f -path '\*\/launchd\/\*\.plist'/);
  assert.match(script, /rm -rf "\$\{KFC_WORK_DIR\}"/);
  assert.match(script, /rm -rf/);
  assert.match(script, /rm -f/);
});
