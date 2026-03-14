import type { AppHealthSnapshot, BotWebSocketHealth } from './domain.ts';

export interface HealthSnapshotSource {
  getLoadedAt(): string;
  listBotIds(): string[];
  getBotWebSocketHealth(): Record<string, BotWebSocketHealth>;
}

export function buildHealthSnapshot(source: HealthSnapshotSource): AppHealthSnapshot {
  const websocket = source.getBotWebSocketHealth();
  return {
    ok: true,
    loadedAt: source.getLoadedAt(),
    bots: source.listBotIds(),
    websocket,
    ready: Object.values(websocket).every((health) => health.state === 'connected'),
  };
}
