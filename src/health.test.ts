import { test } from './test-compat.ts';
import assert from 'node:assert/strict';

import { buildHealthSnapshot } from './health.ts';

test('buildHealthSnapshot returns the canonical health payload shape', () => {
  const snapshot = buildHealthSnapshot({
    getLoadedAt: () => '2026-03-14T08:00:00.000Z',
    listBotIds: () => ['alpha', 'beta'],
    getBotWebSocketHealth: () => ({
      alpha: {
        state: 'connected',
        consecutiveReconnectFailures: 0,
      },
      beta: {
        state: 'reconnecting',
        consecutiveReconnectFailures: 2,
        nextReconnectAt: '2026-03-14T08:05:00.000Z',
      },
    }),
  });

  assert.deepEqual(snapshot, {
    ok: true,
    loadedAt: '2026-03-14T08:00:00.000Z',
    bots: ['alpha', 'beta'],
    websocket: {
      alpha: {
        state: 'connected',
        consecutiveReconnectFailures: 0,
      },
      beta: {
        state: 'reconnecting',
        consecutiveReconnectFailures: 2,
        nextReconnectAt: '2026-03-14T08:05:00.000Z',
      },
    },
    ready: false,
  });
});
