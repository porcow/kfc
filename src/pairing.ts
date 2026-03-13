import { readFile, writeFile } from 'node:fs/promises';

import { loadConfig } from './config/schema.ts';
import { RunRepository } from './persistence/run-repository.ts';

export const LOCAL_RELOAD_PATH = '/admin/reload';

function serializeStringArray(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

export function updateAllowedUsersInToml(
  source: string,
  botId: string,
  actorId: string,
): { text: string; changed: boolean } {
  const lines = source.split(/\r?\n/u);
  const sectionHeader = `[bots.${botId}]`;
  const start = lines.findIndex((line) => line.trim() === sectionHeader);
  if (start === -1) {
    throw new Error(`Bot not found in TOML: ${botId}`);
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/u.test(lines[index])) {
      end = index;
      break;
    }
  }

  let allowedUsersLine = -1;
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s*allowed_users\s*=/u.test(lines[index])) {
      allowedUsersLine = index;
      break;
    }
  }

  if (allowedUsersLine === -1) {
    throw new Error(`allowed_users not found for bot ${botId}`);
  }

  const match = lines[allowedUsersLine].match(/^\s*allowed_users\s*=\s*(\[.*\])\s*$/u);
  if (!match) {
    throw new Error(`Invalid allowed_users line for bot ${botId}`);
  }

  const currentValues = JSON.parse(match[1]) as string[];
  if (currentValues.includes(actorId)) {
    return { text: source, changed: false };
  }

  const updatedValues = [...currentValues, actorId];
  lines[allowedUsersLine] = `allowed_users = ${serializeStringArray(updatedValues)}`;
  return {
    text: lines.join('\n'),
    changed: true,
  };
}

export async function authorizePairing(options: {
  configPath: string;
  pairCode: string;
  reload: (botId: string) => Promise<void>;
}): Promise<{ actorId: string; changed: boolean }> {
  const [botId] = options.pairCode.split('-', 1);
  if (!botId) {
    throw new Error(`Invalid pairing code: ${options.pairCode}`);
  }
  const config = await loadConfig(options.configPath);
  const bot = config.bots[botId];
  if (!bot) {
    throw new Error(`Unknown bot in pairing code: ${botId}`);
  }

  const repository = new RunRepository(bot.storage.sqlitePath);
  try {
    const pairing = repository.getPairing(options.pairCode);
    if (!pairing) {
      throw new Error(`Unknown pairing code: ${options.pairCode}`);
    }
    if (pairing.usedAt) {
      throw new Error(`Pairing code already used: ${options.pairCode}`);
    }
    if (pairing.expiresAt <= new Date().toISOString()) {
      throw new Error(`Pairing code expired: ${options.pairCode}`);
    }

    const source = await readFile(options.configPath, 'utf8');
    if (pairing.botId && pairing.botId !== botId) {
      throw new Error(`Pairing code bot mismatch: ${options.pairCode}`);
    }
    const updated = updateAllowedUsersInToml(source, botId, pairing.actorId);
    if (updated.changed) {
      await writeFile(options.configPath, updated.text);
    }

    await options.reload(botId);
    repository.markPairingUsed(options.pairCode);
    return {
      actorId: pairing.actorId,
      changed: updated.changed,
    };
  } finally {
    repository.close();
  }
}

export async function invokeLocalReload(options: {
  port: number;
  botId: string;
  baseUrl?: string;
}): Promise<{ botCount: number }> {
  const response = await fetch(`${options.baseUrl ?? `http://127.0.0.1:${options.port}`}${LOCAL_RELOAD_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      botId: options.botId,
    }),
  });

  const body = (await response.json()) as { error?: string; botCount?: number };
  if (!response.ok) {
    throw new Error(body.error ?? `Local reload failed with status ${response.status}`);
  }

  return {
    botCount: body.botCount ?? 0,
  };
}
