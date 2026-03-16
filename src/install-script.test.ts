import { test } from './test-compat.ts';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('install.sh exists, is executable, and documents the expected install flow', async () => {
  const scriptPath = resolve(projectRoot, 'install.sh');
  await access(scriptPath, constants.F_OK);
  await access(scriptPath, constants.X_OK);

  const script = await readFile(scriptPath, 'utf8');
  const details = await stat(scriptPath);

  assert.ok(details.isFile());
  assert.ok(script.startsWith('#!/bin/sh'));
  assert.match(script, /porcow\/kfc/);
  assert.match(script, /BUN_INSTALL/);
  assert.match(script, /ensure_bun/);
  assert.match(script, /curl -fsSL https:\/\/bun\.sh\/install \| bash/);
  assert.match(script, /BUN_BIN="\$\(command -v bun\)"/);
  assert.match(script, /bun run - <<'EOF'/);
  assert.match(script, /bun install --production/);
  assert.match(script, /KFC_INSTALL_DIR/);
  assert.match(script, /KFC_BIN_DIR/);
  assert.match(script, /KFC_CONFIG_PATH/);
  assert.match(script, /KFC_RELEASE_API_URL/);
  assert.match(script, /\.kfc-release\.json/);
  assert.match(script, /install-metadata\.json/);
  assert.match(script, /config\/example\.bot\.toml/);
  assert.match(script, /kfc service install --config/);
  assert.match(script, /kfc update/);
  assert.match(script, /kfc rollback/);
  assert.match(script, /export KFC_BUN_BIN="\$\{BUN_BIN\}"/);
  assert.match(script, /exec "\\\$\{KFC_BUN_BIN\}" "\\\$\{APP_DIR\}\/src\/kfc\.ts" "\\\$@"/);
  assert.doesNotMatch(script, /require_command node/u);
  assert.doesNotMatch(script, /require_node_24/u);
  assert.doesNotMatch(script, /node <</u);
  assert.doesNotMatch(script, /exec node --experimental-strip-types/u);
});

test('uninstall.sh exists, is executable, and documents the expected uninstall flow', async () => {
  const scriptPath = resolve(projectRoot, 'uninstall.sh');
  await access(scriptPath, constants.F_OK);
  await access(scriptPath, constants.X_OK);

  const script = await readFile(scriptPath, 'utf8');
  const details = await stat(scriptPath);

  assert.ok(details.isFile());
  assert.ok(script.startsWith('#!/bin/sh'));
  assert.match(script, /KFC_INSTALL_DIR/);
  assert.match(script, /KFC_BIN_DIR/);
  assert.match(script, /KFC_CONFIG_PATH/);
  assert.match(script, /KFC_DELETE_CONFIG/);
  assert.match(script, /KFC_WORK_DIR/);
  assert.match(script, /kfc uninstall --yes/);
  assert.match(script, /--delete-config/);
  assert.match(script, /Library\/LaunchAgents\/com\.kidsalfred\.service\.plist/);
  assert.match(script, /launchctl bootout/);
  assert.match(script, /find "\$\{KFC_WORK_DIR\}" -type f -path '\*\/launchd\/\*\.plist'/);
  assert.match(script, /rm -rf "\$\{KFC_WORK_DIR\}"/);
  assert.match(script, /if \[ "\$\{KFC_DELETE_CONFIG\}" = "true" \]/);
  assert.doesNotMatch(script, /rm -f "\$\{KFC_CONFIG_PATH\}"\n\ncat <<EOF/);
  assert.match(script, /rm -rf/);
  assert.match(script, /rm -f/);
});
