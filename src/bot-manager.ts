import type { AppConfig, BotWebSocketHealth, ReloadResult, RouteKind, RunUpdateSink } from './domain.ts';
import { loadConfig } from './config/schema.ts';
import { createFeishuSdkBridge, type BotBridge } from './feishu/sdk.ts';
import { buildHealthSnapshot } from './health.ts';
import { KidsAlfredService, MemoryRunUpdateSink } from './service.ts';
import { LaunchdCronController, type CronController } from './cron.ts';
import { RunRepository } from './persistence/run-repository.ts';

interface BotRuntime {
  service: KidsAlfredService;
  bridge: BotBridge;
}

interface BotManagerOptions {
  updatesFactory?: (botId: string) => RunUpdateSink;
  bridgeFactory?: (service: KidsAlfredService) => Promise<BotBridge>;
  cronControllerFactory?: (config: AppConfig['bots'][string], repository: RunRepository) => CronController;
}

export class BotManager {
  private config!: AppConfig;
  private readonly runtimes = new Map<string, BotRuntime>();
  private readonly configPath: string;
  private readonly updatesFactory: (botId: string) => RunUpdateSink;
  private readonly bridgeFactory: (service: KidsAlfredService) => Promise<BotBridge>;
  private readonly cronControllerFactory: (
    config: AppConfig['bots'][string],
    repository: RunRepository,
  ) => CronController;
  private webSocketsStarted = false;

  constructor(configPath: string, options: BotManagerOptions = {}) {
    this.configPath = configPath;
    this.updatesFactory = options.updatesFactory ?? (() => new MemoryRunUpdateSink());
    this.bridgeFactory = options.bridgeFactory ?? createFeishuSdkBridge;
    this.cronControllerFactory =
      options.cronControllerFactory ??
      ((config, repository) => new LaunchdCronController(config, repository));
  }

  static async create(
    configPath: string,
    options: BotManagerOptions = {},
  ): Promise<BotManager> {
    const manager = new BotManager(configPath, options);
    await manager.loadInitialState();
    return manager;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getLoadedAt(): string {
    return this.config.loadedAt;
  }

  listBotIds(): string[] {
    return [...this.runtimes.keys()].sort();
  }

  getBot(botId: string): KidsAlfredService | undefined {
    return this.runtimes.get(botId)?.service;
  }

  getBotWebSocketHealth(): Record<string, BotWebSocketHealth> {
    return Object.fromEntries(
      [...this.runtimes.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([botId, runtime]) => [botId, runtime.bridge.getWebSocketHealth()]),
    );
  }

  resolveRoute(path: string): { botId: string; kind: RouteKind } | undefined {
    for (const [botId, runtime] of this.runtimes.entries()) {
      const botConfig = runtime.service.getConfig();
      if (path === botConfig.server.cardPath) {
        return { botId, kind: 'card' };
      }
      if (path === botConfig.server.eventPath) {
        return { botId, kind: 'event' };
      }
    }
    return undefined;
  }

  getRouteHandler(
    path: string,
  ): { botId: string; kind: RouteKind; handler: BotBridge['cardHandler'] | BotBridge['eventHandler'] } | undefined {
    const route = this.resolveRoute(path);
    if (!route) {
      return undefined;
    }
    const runtime = this.runtimes.get(route.botId);
    if (!runtime) {
      return undefined;
    }
    return {
      ...route,
      handler: route.kind === 'card' ? runtime.bridge.cardHandler : runtime.bridge.eventHandler,
    };
  }

  async startWebSockets(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      await runtime.bridge.startWebSocketClient();
    }
    this.webSocketsStarted = true;
  }

  async reload(requestingBotId: string, _actorId: string): Promise<ReloadResult> {
    if (!this.runtimes.has(requestingBotId)) {
      throw new Error(`Unknown bot for reload: ${requestingBotId}`);
    }

    const nextConfig = await loadConfig(this.configPath);
    const nextRuntimes = await this.buildRuntimes(nextConfig);
    const previousRuntimes = new Map(this.runtimes);
    const previousConfig = this.config;

    try {
      this.config = nextConfig;
      this.runtimes.clear();
      for (const [botId, runtime] of nextRuntimes.entries()) {
        this.runtimes.set(botId, runtime);
      }
      this.attachHealthProviders();

      await Promise.allSettled(
        [...previousRuntimes.values()].map(async (runtime) => {
          await runtime.bridge.close();
        }),
      );
      if (this.webSocketsStarted) {
        await Promise.all(
          [...nextRuntimes.values()].map(async (runtime) => {
            await runtime.bridge.startWebSocketClient();
          }),
        );
      }
      await Promise.allSettled(
        [...previousRuntimes.values()].map(async (runtime) => {
          await runtime.service.close();
        }),
      );
      return {
        botCount: this.runtimes.size,
      };
    } catch (error) {
      this.config = previousConfig;
      this.runtimes.clear();
      for (const [botId, runtime] of previousRuntimes.entries()) {
        this.runtimes.set(botId, runtime);
      }
      if (this.webSocketsStarted) {
        await Promise.allSettled(
          [...previousRuntimes.values()].map(async (runtime) => {
            await runtime.bridge.startWebSocketClient();
          }),
        );
      }
      await Promise.allSettled(
        [...nextRuntimes.values()].map(async (runtime) => {
          await runtime.bridge.close();
          await runtime.service.close();
        }),
      );
      throw error;
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.runtimes.values()].map(async (runtime) => {
        await runtime.bridge.close();
        await runtime.service.close();
      }),
    );
    this.webSocketsStarted = false;
  }

  private async loadInitialState(): Promise<void> {
    const config = await loadConfig(this.configPath);
    const runtimes = await this.buildRuntimes(config);
    this.config = config;
    for (const [botId, runtime] of runtimes.entries()) {
      this.runtimes.set(botId, runtime);
    }
    this.attachHealthProviders();
  }

  private async buildRuntimes(config: AppConfig): Promise<Map<string, BotRuntime>> {
    const runtimes = new Map<string, BotRuntime>();
    for (const [botId, botConfig] of Object.entries(config.bots)) {
      const repository = new RunRepository(botConfig.storage.sqlitePath);
      const service = new KidsAlfredService(
        botConfig,
        this.updatesFactory(botId),
        async (requestBotId, actorId) => await this.reload(requestBotId, actorId),
        undefined,
        this.cronControllerFactory(botConfig, repository),
        repository,
        undefined,
        config.server.serviceReconnectNotificationThresholdMs,
      );
      const bridge = await this.bridgeFactory(service);
      service.reconcileServiceEventSubscriptions();
      await service.reconcileCronJobs();
      runtimes.set(botId, {
        service,
        bridge,
      });
    }
    return runtimes;
  }

  private attachHealthProviders(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.service.setHealthSnapshotProvider(() => buildHealthSnapshot(this));
    }
  }
}
