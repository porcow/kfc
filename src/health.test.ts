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
    botHealth: {
      alpha: {
        websocket: {
          state: 'connected',
          consecutiveReconnectFailures: 0,
          stale: true,
        },
        availability: {
          ingressAvailable: true,
          activeIngress: 'websocket',
          summary: 'Available via WebSocket',
        },
      },
      beta: {
        websocket: {
          state: 'reconnecting',
          consecutiveReconnectFailures: 2,
          nextReconnectAt: '2026-03-14T08:05:00.000Z',
          stale: true,
        },
        availability: {
          ingressAvailable: false,
          activeIngress: 'unknown',
          summary: 'Unavailable',
        },
      },
    },
    ready: false,
  });
});

test('buildHealthSnapshot treats recent websocket ingress as available availability in websocket-only mode', () => {
  const snapshot = buildHealthSnapshot({
    getLoadedAt: () => '2026-03-17T09:40:00.000Z',
    listBotIds: () => ['alpha'],
    getBotWebSocketHealth: () => ({
      alpha: {
        state: 'reconnecting',
        consecutiveReconnectFailures: 1,
        lastEventReceivedAt: '2026-03-17T09:39:30.000Z',
        lastEventType: 'im.message.receive_v1',
        stale: false,
      },
    }),
  });

  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.botHealth.alpha.availability, {
    ingressAvailable: true,
    activeIngress: 'websocket',
    summary: 'Available via WebSocket ingress while transport state is reconnecting',
  });
});
