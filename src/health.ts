import type {
  AppHealthSnapshot,
  BotAvailabilityHealth,
  BotIngressHealth,
  BotWebhookHealth,
  BotWebSocketHealth,
  IngressMode,
} from './domain.ts';

const WEBHOOK_STALE_SUMMARY = 'Unavailable';

export interface HealthSnapshotSource {
  getLoadedAt(): string;
  getIngressMode(): IngressMode;
  listBotIds(): string[];
  getBotWebSocketHealth(): Record<string, BotWebSocketHealth>;
  getBotWebhookHealth(): Record<string, BotWebhookHealth>;
}

function buildAvailability(
  ingressMode: IngressMode,
  websocket: BotWebSocketHealth,
  webhook: BotWebhookHealth,
): BotAvailabilityHealth {
  if (ingressMode === 'websocket-only') {
    const ingressAvailable = websocket.state === 'connected';
    return {
      ingressAvailable,
      activeIngress: ingressAvailable ? 'websocket' : 'unknown',
      degraded: !ingressAvailable,
      summary: ingressAvailable ? 'Available via WebSocket' : WEBHOOK_STALE_SUMMARY,
    };
  }

  if (websocket.state === 'connected') {
    return {
      ingressAvailable: true,
      activeIngress: 'websocket',
      degraded: false,
      summary: 'Available via WebSocket',
    };
  }

  if (!webhook.stale && webhook.lastEventReceivedAt) {
    return {
      ingressAvailable: true,
      activeIngress: 'webhook',
      degraded: true,
      summary: `Available via webhook fallback while WebSocket is ${websocket.state}`,
    };
  }

  return {
    ingressAvailable: false,
    activeIngress: 'unknown',
    degraded: true,
    summary: WEBHOOK_STALE_SUMMARY,
  };
}

export function buildHealthSnapshot(source: HealthSnapshotSource): AppHealthSnapshot {
  const ingressMode = source.getIngressMode();
  const websocket = source.getBotWebSocketHealth();
  const webhook = source.getBotWebhookHealth();
  const botHealth: Record<string, BotIngressHealth> = {};
  for (const botId of source.listBotIds()) {
    const socketHealth = websocket[botId] ?? {
      state: 'disconnected',
      consecutiveReconnectFailures: 0,
    };
    const webhookHealth = webhook[botId] ?? {
      enabled: ingressMode === 'websocket-with-webhook-fallback',
      configured: false,
      stale: true,
    };
    botHealth[botId] = {
      websocket: socketHealth,
      webhook: webhookHealth,
      availability: buildAvailability(ingressMode, socketHealth, webhookHealth),
    };
  }
  return {
    ok: true,
    loadedAt: source.getLoadedAt(),
    bots: source.listBotIds(),
    ingressMode,
    websocket,
    botHealth,
    degraded: Object.values(botHealth).some((health) => health.availability.degraded),
    ready: Object.values(botHealth).every((health) => health.availability.ingressAvailable),
  };
}
