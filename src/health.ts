import type {
  AppHealthSnapshot,
  BotAvailabilityHealth,
  BotIngressHealth,
  BotWebSocketHealth,
} from './domain.ts';

const UNAVAILABLE_SUMMARY = 'Unavailable';
export const INGRESS_OBSERVATION_WINDOW_MS = 5 * 60_000;

export interface HealthSnapshotSource {
  getLoadedAt(): string;
  listBotIds(): string[];
  getBotWebSocketHealth(): Record<string, BotWebSocketHealth>;
}

export function isIngressObservationStale(
  lastEventReceivedAt: string | undefined,
  now: string,
): boolean {
  return (
    !lastEventReceivedAt ||
    new Date(now).valueOf() - new Date(lastEventReceivedAt).valueOf() > INGRESS_OBSERVATION_WINDOW_MS
  );
}

export function buildAvailability(websocket: BotWebSocketHealth): BotAvailabilityHealth {
  if (!websocket.stale && websocket.lastEventReceivedAt) {
    return {
      ingressAvailable: true,
      activeIngress: 'websocket',
      summary:
        websocket.state === 'connected'
          ? 'Available via WebSocket'
          : `Available via WebSocket ingress while transport state is ${websocket.state}`,
    };
  }

  const ingressAvailable = websocket.state === 'connected';
  if (ingressAvailable) {
    return {
      ingressAvailable,
      activeIngress: 'websocket',
      summary: 'Available via WebSocket',
    };
  }

  return {
    ingressAvailable: false,
    activeIngress: 'unknown',
    summary: UNAVAILABLE_SUMMARY,
  };
}

export function buildHealthSnapshot(source: HealthSnapshotSource): AppHealthSnapshot {
  const websocket = source.getBotWebSocketHealth();
  const now = new Date().toISOString();
  const botHealth: Record<string, BotIngressHealth> = {};
  for (const botId of source.listBotIds()) {
    const socketHealth = websocket[botId] ?? {
      state: 'disconnected',
      consecutiveReconnectFailures: 0,
      stale: true,
    };
    const normalizedSocketHealth = {
      ...socketHealth,
      stale:
        socketHealth.stale ??
        isIngressObservationStale(socketHealth.lastEventReceivedAt, now),
    };
    botHealth[botId] = {
      websocket: normalizedSocketHealth,
      availability: buildAvailability(normalizedSocketHealth),
    };
  }
  return {
    ok: true,
    loadedAt: source.getLoadedAt(),
    bots: source.listBotIds(),
    botHealth,
    ready: Object.values(botHealth).every((health) => health.availability.ingressAvailable),
  };
}
