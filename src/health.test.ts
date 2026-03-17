import { test } from './test-compat.ts';
import assert from 'node:assert/strict';

import { buildHealthSnapshot } from './health.ts';

test('buildHealthSnapshot returns the canonical health payload shape', () => {
  const snapshot = buildHealthSnapshot({
    getLoadedAt: () => '2026-03-14T08:00:00.000Z',
    getIngressMode: () => 'websocket-with-webhook-fallback',
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
    getBotWebhookHealth: () => ({
      alpha: {
        enabled: true,
        configured: true,
        stale: false,
      },
      beta: {
        enabled: true,
        configured: true,
        lastEventReceivedAt: '2026-03-14T08:04:30.000Z',
        lastEventType: 'im.message.receive_v1',
        stale: false,
      },
    }),
  });

  assert.deepEqual(snapshot, {
    ok: true,
    loadedAt: '2026-03-14T08:00:00.000Z',
    bots: ['alpha', 'beta'],
    ingressMode: 'websocket-with-webhook-fallback',
    degraded: true,
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
    botHealth: {
      alpha: {
        websocket: {
          state: 'connected',
          consecutiveReconnectFailures: 0,
        },
        webhook: {
          enabled: true,
          configured: true,
          stale: false,
        },
        availability: {
          ingressAvailable: true,
          activeIngress: 'websocket',
          degraded: false,
          summary: 'Available via WebSocket',
        },
      },
      beta: {
        websocket: {
          state: 'reconnecting',
          consecutiveReconnectFailures: 2,
          nextReconnectAt: '2026-03-14T08:05:00.000Z',
        },
        webhook: {
          enabled: true,
          configured: true,
          lastEventReceivedAt: '2026-03-14T08:04:30.000Z',
          lastEventType: 'im.message.receive_v1',
          stale: false,
        },
        availability: {
          ingressAvailable: true,
          activeIngress: 'webhook',
          degraded: true,
          summary: 'Available via webhook fallback while WebSocket is reconnecting',
        },
      },
    },
    ready: true,
  });
});
